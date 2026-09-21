importScripts("./versie.js");

const CACHE_NAAM = `workout-app-${APP_VERSIE}`;
const APP_BESTANDEN = [
  "./",
  "./index.html",
  "./style.css",
  "./versie.js",
  "./app.js",
  "./sw.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./voorbeeld-plan.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAAM);
    const verzoeken = APP_BESTANDEN.map((pad) => new Request(pad, { cache: "reload" }));
    await cache.addAll(verzoeken);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNamen = await caches.keys();
    await Promise.all(
      cacheNamen
        .filter((naam) => naam.startsWith("workout-app-") && naam !== CACHE_NAAM)
        .map((naam) => caches.delete(naam)),
    );
    await self.clients.claim();
  })());
});

// De rustbel komt als pushmelding binnen: de Worker stuurt hem op het moment
// dat de rust voorbij is, ook als de app dicht is en het scherm op slot staat.
// iOS eist dat elke push een zichtbare melding oplevert (userVisibleOnly).
self.addEventListener("push", (event) => {
  let gegevens = {};
  try {
    gegevens = event.data ? event.data.json() : {};
  } catch {
    gegevens = {};
  }
  event.waitUntil(self.registration.showNotification(gegevens.titel || "Rust voorbij", {
    body: gegevens.tekst || "Volgende set.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    // Eén tag met renotify: een nieuwe bel vervangt een oude in plaats van
    // zich erbovenop te stapelen, maar laat wel opnieuw geluid horen.
    tag: "rustbel",
    renotify: true,
    vibrate: [250, 120, 250],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const vensters = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const venster of vensters) {
      if ("focus" in venster) return venster.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow("./") : undefined;
  })());
});

self.addEventListener("fetch", (event) => {
  const verzoek = event.request;
  const url = new URL(verzoek.url);

  if (verzoek.method !== "GET" || url.hostname === "api.github.com" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(netwerkEerst(verzoek));
});

async function netwerkEerst(verzoek) {
  try {
    const antwoord = await fetch(verzoek, { cache: "no-store" });
    if (antwoord.ok && antwoord.type === "basic") {
      const cache = await caches.open(CACHE_NAAM);
      await cache.put(verzoek, antwoord.clone());
    }
    return antwoord;
  } catch {
    const cache = await caches.open(CACHE_NAAM);
    const gecachet = await cache.match(verzoek, { ignoreSearch: true });
    if (gecachet) return gecachet;

    if (verzoek.mode === "navigate") {
      const startscherm = await cache.match("./index.html");
      if (startscherm) return startscherm;
    }

    return Response.error();
  }
}
