// Draait de échte worker.js tegen een nagebootste Workers-runtime: een
// Durable-Object-namespace met een Map als opslag en een handmatig alarm, en
// een onderschepte fetch die de uitgaande push opvangt. Zo is de routering,
// de sleutelcontrole, het alarm en de uiteindelijke melding te testen zonder
// wrangler. De melding wordt daarna ontcijferd met node:crypto — een eigen
// implementatie van de ontvangerskant, zodat een fout in src/webpush.js niet
// aan beide kanten tegen elkaar wegvalt.
//
//   node tools/test-worker.mjs

import { webcrypto, createHmac, createDecipheriv, createECDH, createPublicKey, verify as nodeVerify } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { default: worker, Belplanner } = await import("../src/worker.js");

const APP_SLEUTEL = "test-sleutel-123";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const vanB64u = (tekst) => Buffer.from(tekst, "base64url");

let fouten = 0;
function controleer(naam, gelukt, extra = "") {
  console.log(`${gelukt ? "ok  " : "FOUT"}  ${naam}${extra ? ` — ${extra}` : ""}`);
  if (!gelukt) fouten += 1;
}

// --- nagebootste runtime -----------------------------------------------------

class NepOpslag {
  constructor() { this.data = new Map(); this.alarm = null; }
  async put(sleutelOfObject, waarde) {
    if (typeof sleutelOfObject === "object") {
      for (const [k, v] of Object.entries(sleutelOfObject)) this.data.set(k, v);
    } else this.data.set(sleutelOfObject, waarde);
  }
  async get(sleutel) { return this.data.get(sleutel); }
  async delete(sleutel) { return this.data.delete(sleutel); }
  async setAlarm(tijd) { this.alarm = tijd; }
  async deleteAlarm() { this.alarm = null; }
}

const objecten = new Map();
function haalObject(naam) {
  if (!objecten.has(naam)) {
    const state = { storage: new NepOpslag() };
    objecten.set(naam, { state, instantie: null });
  }
  const invoer = objecten.get(naam);
  if (!invoer.instantie) invoer.instantie = new Belplanner(invoer.state, env);
  return invoer;
}

const env = {
  APP_SLEUTEL,
  VAPID_ONDERWERP: "mailto:test@example.com",
  VAPID_PRIVE_JWK: null, // hieronder gevuld
  TOEGESTANE_ORIGIN: "*",
  BELPLANNER: {
    idFromName: (naam) => naam,
    get: (naam) => ({ fetch: (url, init) => haalObject(naam).instantie.fetch(new Request(url, init)) }),
  },
};

const vapidPaar = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const vapidJwk = await crypto.subtle.exportKey("jwk", vapidPaar.privateKey);
env.VAPID_PRIVE_JWK = JSON.stringify({ kty: vapidJwk.kty, crv: vapidJwk.crv, x: vapidJwk.x, y: vapidJwk.y, d: vapidJwk.d });

// Onderschep de uitgaande push naar de pushdienst.
let laatstePush = null;
let pushStatus = 201;
const echteFetch = globalThis.fetch;
globalThis.fetch = async (bron, init = {}) => {
  const url = typeof bron === "string" ? bron : bron.url;
  if (url.startsWith("https://push.test/")) {
    laatstePush = { url, headers: init.headers, body: Buffer.from(init.body) };
    return new Response("", { status: pushStatus });
  }
  return echteFetch(bron, init);
};

// --- nep-telefoon ------------------------------------------------------------

const ua = createECDH("prime256v1");
ua.generateKeys();
const authGeheim = webcrypto.getRandomValues(new Uint8Array(16));
const abonnement = {
  endpoint: "https://push.test/abonnement/abc123",
  keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(authGeheim) },
};

function hmac(sleutel, data) {
  return createHmac("sha256", sleutel).update(data).digest();
}

// Ontcijfert een aes128gcm-body zoals de telefoon dat zou doen (RFC 8188/8291).
function ontcijfer(body) {
  const zout = body.subarray(0, 16);
  const idLengte = body[20];
  const asPubliek = body.subarray(21, 21 + idLengte);
  const cijfertekst = body.subarray(21 + idLengte);

  const gedeeld = ua.computeSecret(asPubliek);
  const prkSleutel = hmac(Buffer.from(authGeheim), gedeeld);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info"), Buffer.from([0]), ua.getPublicKey(), asPubliek, Buffer.from([1]),
  ]);
  const ikm = hmac(prkSleutel, keyInfo);
  const prk = hmac(zout, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm"), Buffer.from([0, 1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce"), Buffer.from([0, 1])])).subarray(0, 12);

  const tag = cijfertekst.subarray(cijfertekst.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const klaar = Buffer.concat([decipher.update(cijfertekst.subarray(0, cijfertekst.length - 16)), decipher.final()]);
  return klaar.subarray(0, klaar.length - 1).toString("utf8"); // 0x02-scheider eraf
}

// --- hulpjes -----------------------------------------------------------------

function verzoek(pad, lichaam, sleutel = APP_SLEUTEL, methode = "POST") {
  return new Request(`https://bel.test${pad}`, {
    method: methode,
    headers: sleutel === null
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/json", "X-Workout-Sleutel": sleutel },
    body: methode === "GET" ? undefined : JSON.stringify(lichaam ?? {}),
  });
}

const roep = async (...args) => {
  const res = await worker.fetch(verzoek(...args), env);
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// --- tests -------------------------------------------------------------------

const sleutelRes = await worker.fetch(verzoek("/sleutel", null, null, "GET"), env);
const sleutelBody = await sleutelRes.json();
const verwachtPubliek = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", vapidPaar.publicKey)));
controleer("GET /sleutel geeft de publieke VAPID-sleutel", sleutelBody.publiek === verwachtPubliek);
controleer("CORS-kop staat op elk antwoord", sleutelRes.headers.get("Access-Control-Allow-Origin") === "*");

controleer("verkeerde sleutel geeft 401", (await roep("/plan", { id: "x".repeat(32) }, "fout")).status === 401);
controleer("ontbrekende sleutel geeft 401", (await roep("/plan", { id: "x".repeat(32) }, null)).status === 401);
controleer("onvolledig abonnement geeft 400", (await roep("/abonneer", { abonnement: { endpoint: "https://push.test/x" } })).status === 400);
controleer("onbekend pad geeft 404", (await roep("/onzin", {})).status === 404);

const aanmelding = await roep("/abonneer", { abonnement });
const id = aanmelding.body.id;
controleer("abonneren geeft een id terug", typeof id === "string" && /^[A-Za-z0-9_-]{32}$/.test(id), id);
const tweede = await roep("/abonneer", { abonnement });
controleer("zelfde endpoint geeft hetzelfde id", tweede.body.id === id);

controleer("plannen op een onbekend id geeft 404", (await roep("/plan", { id: "A".repeat(32), seconden: 5 })).status === 404);
controleer("te ver vooruit plannen geeft 400", (await roep("/plan", { id, seconden: 7200 })).status === 400);

const voor = Date.now();
const gepland = await roep("/plan", { id, seconden: 90, titel: "Rust voorbij", tekst: "Volgende set — Full body A" });
const opslag = haalObject(id).state.storage;
controleer("plannen zet een alarm op de juiste tijd",
  gepland.status === 200 && Math.abs(opslag.alarm - (voor + 90_000)) < 2000,
  `alarm over ${Math.round((opslag.alarm - voor) / 1000)} s`);

await roep("/plan", { id, seconden: 30 });
controleer("opnieuw plannen vervangt het alarm", Math.abs(opslag.alarm - (Date.now() + 30_000)) < 2000);

await roep("/annuleer", { id });
controleer("annuleren haalt het alarm weg", opslag.alarm === null);

// Het alarm laten afgaan en de melding ontcijferen zoals de telefoon dat doet.
await roep("/plan", { id, seconden: 1, titel: "Rust voorbij", tekst: "Volgende set — Full body A" });
laatstePush = null;
await haalObject(id).instantie.alarm();
controleer("alarm stuurt een push naar het endpoint", laatstePush?.url === abonnement.endpoint);
controleer("push heeft de juiste koppen",
  laatstePush?.headers["Content-Encoding"] === "aes128gcm"
  && laatstePush?.headers["Content-Type"] === "application/octet-stream"
  && laatstePush?.headers.Urgency === "high"
  && Number(laatstePush?.headers.TTL) > 0);

let inhoud = null;
try { inhoud = JSON.parse(ontcijfer(laatstePush.body)); } catch (fout) { inhoud = { fout: String(fout) }; }
controleer("de telefoon kan de melding ontcijferen",
  inhoud?.titel === "Rust voorbij" && inhoud?.tekst === "Volgende set — Full body A",
  JSON.stringify(inhoud).slice(0, 120));

// VAPID-kop: JWT met de juiste doelgroep en een geldige handtekening.
const kop = laatstePush.headers.Authorization || "";
const jwt = kop.match(/t=([^,]+)/)?.[1] ?? "";
const meegestuurdePubliek = kop.match(/k=(.+)$/)?.[1] ?? "";
const [jwtKop, jwtInhoud, jwtSig] = jwt.split(".");
const lading = JSON.parse(vanB64u(jwtInhoud).toString("utf8"));
controleer("VAPID-kop draagt de publieke sleutel", meegestuurdePubliek === verwachtPubliek);
controleer("JWT wijst naar de origin van de pushdienst", lading.aud === "https://push.test");
controleer("JWT verloopt in de toekomst", lading.exp > Math.floor(Date.now() / 1000));
controleer("JWT-header is ES256", JSON.parse(vanB64u(jwtKop).toString("utf8")).alg === "ES256");
const vapidPubliekNode = createPublicKey({
  key: { kty: "EC", crv: "P-256", x: vapidJwk.x, y: vapidJwk.y }, format: "jwk",
});
controleer("JWT-handtekening verifieert",
  nodeVerify("sha256", Buffer.from(`${jwtKop}.${jwtInhoud}`), { key: vapidPubliekNode, dsaEncoding: "ieee-p1363" }, vanB64u(jwtSig)));

controleer("alarm ruimt belOm op", (await opslag.get("belOm")) === undefined);

// Een ingetrokken abonnement hoort opgeruimd te worden.
pushStatus = 410;
await roep("/plan", { id, seconden: 1 });
await haalObject(id).instantie.alarm();
controleer("410 van de pushdienst wist het abonnement", (await opslag.get("abonnement")) === undefined);
controleer("daarna geeft plannen 404", (await roep("/plan", { id, seconden: 5 })).status === 404);

process.exit(fouten ? 1 : 0);
