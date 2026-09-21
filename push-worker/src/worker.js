// Workout-belplanner.
//
// Waarom dit ding bestaat: op iOS kan een PWA met het scherm op slot geen
// geluid starten dat er nog niet is (W11–W13 in BACKLOG.md). Alles wat wél
// werkt — één WAV die de hele rust beslaat — bezet de audiosessie en pauzeert
// daarmee de podcast. Een Web Push-melding komt van buiten, heeft geen
// audiosessie nodig en laat de podcast dus met rust.
//
// Rolverdeling: de app meldt bij het afvinken van een set "bel over N seconden";
// deze Worker zet een Durable-Object-alarm op dat moment en stuurt dán pas de
// melding. Een Worker zonder DO kan dat niet: die leeft alleen tijdens een
// verzoek en heeft geen wekker.

import { stuurPush, vapidPubliekUitJwk, bytesNaarBase64url, naarBytes } from "./webpush.js";

const MAX_VOORUIT_SEC = 3600; // een rustpauze duurt minuten, geen uren

export default {
  async fetch(request, env) {
    // Zonder deze vangnetten geeft een fout een kale 1101-pagina; dan is vanaf
    // de telefoon niet te zien wat er mis is. Nu komt de reden in het
    // instellingenscherm terecht.
    try {
      return await behandel(request, env);
    } catch (fout) {
      return antwoord(env, { fout: fout instanceof Error ? fout.message : "Onbekende fout." }, 500);
    }
  },
};

async function behandel(request, env) {
  {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return antwoord(env, null, 204);
    if (url.pathname === "/sleutel" && request.method === "GET") {
      return antwoord(env, { publiek: await vapidPubliekUitJwk(leesJwk(env)) });
    }

    if (request.method !== "POST") return antwoord(env, { fout: "Onbekend pad." }, 404);
    if (!sleutelKlopt(request, env)) return antwoord(env, { fout: "Sleutel klopt niet." }, 401);

    let lichaam;
    try {
      lichaam = await request.json();
    } catch {
      return antwoord(env, { fout: "Geen geldige JSON." }, 400);
    }

    if (url.pathname === "/abonneer") {
      const abonnement = lichaam?.abonnement;
      if (!abonnement?.endpoint || !abonnement?.keys?.p256dh || !abonnement?.keys?.auth) {
        return antwoord(env, { fout: "Abonnement is onvolledig." }, 400);
      }
      const id = await maakId(abonnement.endpoint);
      const uit = await naarDo(env, id, "/bewaar", { abonnement });
      return antwoord(env, { id, ...uit });
    }

    if (["/plan", "/annuleer", "/test"].includes(url.pathname)) {
      const id = typeof lichaam?.id === "string" ? lichaam.id : "";
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return antwoord(env, { fout: "Onbekende id." }, 400);
      const uit = await naarDo(env, id, url.pathname, lichaam);
      return antwoord(env, uit.uit, uit.status);
    }

    return antwoord(env, { fout: "Onbekend pad." }, 404);
  }
}

export class Belplanner {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const lichaam = await request.json().catch(() => ({}));

    if (url.pathname === "/bewaar") {
      await this.state.storage.put("abonnement", lichaam.abonnement);
      return Response.json({ bewaard: true });
    }

    const abonnement = await this.state.storage.get("abonnement");
    if (!abonnement) return Response.json({ fout: "Nog niet geabonneerd." }, { status: 404 });

    if (url.pathname === "/plan") {
      const seconden = Number(lichaam.seconden);
      if (!(seconden >= 0) || seconden > MAX_VOORUIT_SEC) {
        return Response.json({ fout: "Tijd buiten bereik." }, { status: 400 });
      }
      const belOm = Date.now() + Math.round(seconden * 1000);
      await this.state.storage.put({
        belOm,
        titel: kort(lichaam.titel, 60) || "Rust voorbij",
        tekst: kort(lichaam.tekst, 120) || "Volgende set.",
      });
      // setAlarm vervangt een bestaand alarm; "+30 s" en een volgende set
      // hoeven dus niets op te ruimen.
      await this.state.storage.setAlarm(belOm);
      return Response.json({ gepland: new Date(belOm).toISOString() });
    }

    if (url.pathname === "/annuleer") {
      await this.state.storage.deleteAlarm();
      await this.state.storage.delete("belOm");
      return Response.json({ geannuleerd: true });
    }

    if (url.pathname === "/test") {
      const uitslag = await this.verstuur(abonnement, "Testbel", "Zo klinkt de melding tijdens je rust.");
      return Response.json(uitslag, { status: uitslag.status < 300 ? 200 : 502 });
    }

    return Response.json({ fout: "Onbekend pad." }, { status: 404 });
  }

  async alarm() {
    const [abonnement, titel, tekst] = await Promise.all([
      this.state.storage.get("abonnement"),
      this.state.storage.get("titel"),
      this.state.storage.get("tekst"),
    ]);
    await this.state.storage.delete("belOm");
    if (!abonnement) return;
    const uitslag = await this.verstuur(abonnement, titel || "Rust voorbij", tekst || "Volgende set.");
    // 404/410 = de telefoon heeft het abonnement ingetrokken (app verwijderd,
    // meldingen uitgezet). Opruimen, anders blijft de Worker in het niets duwen.
    if (uitslag.status === 404 || uitslag.status === 410) await this.state.storage.delete("abonnement");
  }

  async verstuur(abonnement, titel, tekst) {
    const inhoud = JSON.stringify({ titel, tekst, tijd: Date.now() });
    try {
      return await stuurPush(abonnement, inhoud, leesJwk(this.env), this.env.VAPID_ONDERWERP || "mailto:workout@example.com");
    } catch (fout) {
      return { status: 500, tekst: fout instanceof Error ? fout.message : "Onbekende fout." };
    }
  }
}

// Het secret is een JSON-regel met aanhalingstekens; die raakt bij handmatig
// plakken in een Windows-prompt makkelijk beschadigd. Daarom een fout die
// zegt wat er mis is in plaats van een kale JSON.parse-crash.
function leesJwk(env) {
  if (!env.VAPID_PRIVE_JWK) throw new Error("VAPID_PRIVE_JWK ontbreekt als secret.");
  let jwk;
  try {
    jwk = JSON.parse(env.VAPID_PRIVE_JWK);
  } catch {
    throw new Error("VAPID_PRIVE_JWK is geen geldige JSON. Upload hem opnieuw met: npx wrangler secret bulk geheimen.json");
  }
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || !jwk.d) {
    throw new Error("VAPID_PRIVE_JWK mist kty/crv/x/y/d. Maak een nieuw paar met: node tools/vapid-sleutels.mjs");
  }
  return jwk;
}

// Vergelijking in vaste tijd, zodat het antwoord niets over de sleutel verraadt.
function sleutelKlopt(request, env) {
  const gegeven = naarBytes(request.headers.get("X-Workout-Sleutel") || "");
  const verwacht = naarBytes(env.APP_SLEUTEL || "");
  if (!verwacht.length) return false;
  let verschil = gegeven.length ^ verwacht.length;
  for (let i = 0; i < Math.max(gegeven.length, verwacht.length); i += 1) {
    verschil |= (gegeven[i] ?? 0) ^ (verwacht[i] ?? 0);
  }
  return verschil === 0;
}

// De id volgt uit het endpoint, dus dezelfde telefoon landt na een nieuw
// abonnement in hetzelfde Durable Object en er blijft niets rondslingeren.
async function maakId(endpoint) {
  const hash = await crypto.subtle.digest("SHA-256", naarBytes(endpoint));
  return bytesNaarBase64url(new Uint8Array(hash)).slice(0, 32);
}

async function naarDo(env, id, pad, lichaam) {
  const stub = env.BELPLANNER.get(env.BELPLANNER.idFromName(id));
  const res = await stub.fetch(`https://belplanner${pad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lichaam ?? {}),
  });
  return { status: res.status, uit: await res.json().catch(() => ({})) };
}

function kort(waarde, max) {
  return typeof waarde === "string" ? waarde.slice(0, max) : "";
}

function antwoord(env, data, status = 200) {
  const origin = env.TOEGESTANE_ORIGIN || "*";
  const koppen = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Workout-Sleutel",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (data === null) return new Response(null, { status, headers: koppen });
  return Response.json(data, { status, headers: koppen });
}
