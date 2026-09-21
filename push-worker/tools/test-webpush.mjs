// Controleert de versleuteling tegen de testvector uit RFC 8291 §5 en de
// VAPID-handtekening tegen de bijbehorende publieke sleutel. Draaien met:
//   node tools/test-webpush.mjs
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { versleutel, base64urlNaarBytes, bytesNaarBase64url, vapidPubliekUitJwk, naarBytes } =
  await import("../src/webpush.js");

const VECTOR = {
  klaartekst: "When I grow up, I want to be a watermelon",
  uaPubliek: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  asPubliek: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrive: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  zout: "DGv6ra1nlYgDCS1FRnbzlw",
  verwacht:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

let fouten = 0;
function controleer(naam, gelukt, extra = "") {
  console.log(`${gelukt ? "ok  " : "FOUT"}  ${naam}${extra ? ` — ${extra}` : ""}`);
  if (!gelukt) fouten += 1;
}

// 1. Versleuteling tegen de RFC-vector.
const punt = base64urlNaarBytes(VECTOR.asPubliek);
const jwkAs = {
  kty: "EC", crv: "P-256",
  x: bytesNaarBase64url(punt.slice(1, 33)),
  y: bytesNaarBase64url(punt.slice(33, 65)),
  d: VECTOR.asPrive,
  ext: true, key_ops: ["deriveBits"],
};
const prive = await crypto.subtle.importKey("jwk", jwkAs, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
const publiek = await crypto.subtle.importKey(
  "jwk", { kty: "EC", crv: "P-256", x: jwkAs.x, y: jwkAs.y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, true, [],
);
const lichaam = await versleutel(
  { keys: { p256dh: VECTOR.uaPubliek, auth: VECTOR.auth } },
  VECTOR.klaartekst,
  { wegwerp: { privateKey: prive, publicKey: publiek }, zout: base64urlNaarBytes(VECTOR.zout) },
);
const gekregen = bytesNaarBase64url(lichaam);
controleer("aes128gcm-body gelijk aan RFC 8291 §5", gekregen === VECTOR.verwacht,
  gekregen === VECTOR.verwacht ? "" : `kreeg ${gekregen.slice(0, 48)}…`);

// 2. VAPID: publieke sleutel uit de JWK, en een handtekening die verifieert.
const paar = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", paar.privateKey);
const afgeleid = base64urlNaarBytes(await vapidPubliekUitJwk(jwk));
const ruwPubliek = new Uint8Array(await crypto.subtle.exportKey("raw", paar.publicKey));
controleer("publieke VAPID-sleutel uit JWK klopt",
  afgeleid.length === 65 && afgeleid.every((b, i) => b === ruwPubliek[i]));

const sleutel = await crypto.subtle.importKey(
  "jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, ext: true, key_ops: ["sign"] },
  { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
);
const kopStuk = naarBytes("test");
const handtekening = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, sleutel, kopStuk);
controleer("ES256-handtekening verifieert",
  await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, paar.publicKey, handtekening, kopStuk));

process.exit(fouten ? 1 : 0);
