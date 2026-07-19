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
