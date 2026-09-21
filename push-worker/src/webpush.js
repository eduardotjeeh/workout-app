// Web Push zonder npm-pakket: VAPID (RFC 8292) + aes128gcm (RFC 8188/8291),
// puur op WebCrypto zoals Cloudflare Workers die aanbiedt. Eén bestand, geen
// build-stap — dezelfde afspraak als de app zelf (zie ARCHITECTUUR.md §6).

export function naarBytes(tekst) {
  return new TextEncoder().encode(tekst);
}

export function base64urlNaarBytes(tekst) {
  const plat = tekst.replace(/-/g, "+").replace(/_/g, "/");
  const opgevuld = plat + "=".repeat((4 - (plat.length % 4)) % 4);
  const ruw = atob(opgevuld);
  const uit = new Uint8Array(ruw.length);
  for (let i = 0; i < ruw.length; i += 1) uit[i] = ruw.charCodeAt(i);
  return uit;
}

export function bytesNaarBase64url(bytes) {
  let ruw = "";
  for (const byte of bytes) ruw += String.fromCharCode(byte);
  return btoa(ruw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function plak(...delen) {
  const totaal = delen.reduce((som, deel) => som + deel.length, 0);
  const uit = new Uint8Array(totaal);
  let positie = 0;
  for (const deel of delen) {
    uit.set(deel, positie);
    positie += deel.length;
  }
  return uit;
}

async function hmac(sleutelBytes, dataBytes) {
  const sleutel = await crypto.subtle.importKey(
    "raw", sleutelBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", sleutel, dataBytes));
}

// HKDF met een vaste uitvoer van hooguit 32 bytes: dan volstaat één ronde.
async function hkdf(zout, ikm, info, lengte) {
  const prk = await hmac(zout, ikm);
  const okm = await hmac(prk, plak(info, Uint8Array.of(1)));
  return okm.slice(0, lengte);
}

export async function vapidPubliekUitJwk(jwk) {
  return bytesNaarBase64url(plak(
    Uint8Array.of(4), base64urlNaarBytes(jwk.x), base64urlNaarBytes(jwk.y),
  ));
}

// De JWT die de pushdienst vertelt wie er stuurt. Twaalf uur geldig; korter
// mag, maar dan loopt hij mid-training af terwijl de klok van de Worker en die
// van Apple een paar seconden uit elkaar kunnen lopen.
async function vapidKop(endpoint, jwk, onderwerp) {
  const doel = new URL(endpoint).origin;
  const kop = { typ: "JWT", alg: "ES256" };
  const inhoud = { aud: doel, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: onderwerp };
  const teTekenen = naarBytes(
    `${bytesNaarBase64url(naarBytes(JSON.stringify(kop)))}.${bytesNaarBase64url(naarBytes(JSON.stringify(inhoud)))}`,
  );
  const sleutel = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, ext: true, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const handtekening = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, sleutel, teTekenen),
  );
  const jwt = `${new TextDecoder().decode(teTekenen)}.${bytesNaarBase64url(handtekening)}`;
  return `vapid t=${jwt}, k=${await vapidPubliekUitJwk(jwk)}`;
}

// RFC 8291: uit de publieke sleutel van de telefoon en een wegwerp-sleutelpaar
// van de server volgt één sleutel die alleen die telefoon kan afleiden.
// `opties` bestaat alleen voor de testvector uit RFC 8291 §5, die een vast
// sleutelpaar en zout voorschrijft. In productie is beide willekeurig.
export async function versleutel(abonnement, inhoud, opties = {}) {
  const uaPubliek = base64urlNaarBytes(abonnement.keys.p256dh);
  const authGeheim = base64urlNaarBytes(abonnement.keys.auth);

  const wegwerp = opties.wegwerp ?? await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );
  const asPubliek = new Uint8Array(await crypto.subtle.exportKey("raw", wegwerp.publicKey));
  const uaSleutel = await crypto.subtle.importKey(
    "raw", uaPubliek, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const gedeeld = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaSleutel }, wegwerp.privateKey, 256),
  );

  const ikm = await hkdf(
    authGeheim,
    gedeeld,
    plak(naarBytes("WebPush: info"), Uint8Array.of(0), uaPubliek, asPubliek),
    32,
  );
  const zout = opties.zout ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(zout, ikm, plak(naarBytes("Content-Encoding: aes128gcm"), Uint8Array.of(0)), 16);
  const nonce = await hkdf(zout, ikm, plak(naarBytes("Content-Encoding: nonce"), Uint8Array.of(0)), 12);

  const aesSleutel = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // 0x02 sluit het enige record af; er is geen tweede blok.
  const klaartekst = plak(naarBytes(inhoud), Uint8Array.of(2));
  const cijfertekst = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesSleutel, klaartekst),
  );

  const recordGrootte = new Uint8Array(4);
  new DataView(recordGrootte.buffer).setUint32(0, 4096, false);
  return plak(zout, recordGrootte, Uint8Array.of(asPubliek.length), asPubliek, cijfertekst);
}

export async function stuurPush(abonnement, inhoud, jwk, onderwerp, ttl = 60) {
  const lichaam = await versleutel(abonnement, inhoud);
  const antwoord = await fetch(abonnement.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidKop(abonnement.endpoint, jwk, onderwerp),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "high",
      // Eén onderwerp: een nieuwe bel vervangt een nog niet bezorgde oude,
      // zodat er nooit twee meldingen op het slotscherm blijven staan.
      Topic: "rustbel",
    },
    body: lichaam,
  });
  return { status: antwoord.status, tekst: antwoord.ok ? "" : (await antwoord.text()).slice(0, 300) };
}
