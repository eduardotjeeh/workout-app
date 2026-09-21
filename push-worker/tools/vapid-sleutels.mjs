// Maakt eenmalig een VAPID-sleutelpaar plus een app-sleutel, en schrijft ze
// klaar voor "wrangler secret bulk". Dat laatste is bewust: de privésleutel is
// een JSON-regel met aanhalingstekens, en die met de hand in een prompt plakken
// gaat op Windows makkelijk mis (cmd en PowerShell knabbelen aan quotes).
//
//   node tools/vapid-sleutels.mjs
//   npx wrangler secret bulk geheimen.json
//
// geheimen.json bevat de privésleutel en staat daarom in .gitignore. Verwijder
// hem na het uploaden; de publieke sleutel haalt de app zelf op bij /sleutel.
import { webcrypto } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const crypto = globalThis.crypto ?? webcrypto;
const hier = dirname(fileURLToPath(import.meta.url));
const doel = join(hier, "..", "geheimen.json");

const paar = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", paar.privateKey);
const ruw = new Uint8Array(await crypto.subtle.exportKey("raw", paar.publicKey));

const priveJwk = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });
const appSleutel = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");

writeFileSync(doel, `${JSON.stringify({ VAPID_PRIVE_JWK: priveJwk, APP_SLEUTEL: appSleutel }, null, 2)}\n`, "utf8");

console.log("Geschreven naar geheimen.json (staat in .gitignore).");
console.log();
console.log("Upload ze in één keer met:");
console.log("  npx wrangler secret bulk geheimen.json");
console.log();
console.log("App-sleutel — deze vul je straks in de app in onder Instellingen:");
console.log(`  ${appSleutel}`);
console.log();
console.log("Publieke VAPID-sleutel (mag openbaar; de app haalt hem zelf op bij /sleutel):");
console.log(`  ${Buffer.from(ruw).toString("base64url")}`);
console.log();
console.log("Verwijder geheimen.json zodra de upload gelukt is.");
