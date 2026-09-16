/**
 * Service worker.
 *
 * Réseau d'abord pour tout ce qui touche aux données : un montant
 * périmé servi depuis le cache serait pire que pas de montant du tout.
 * Le cache ne sert que de filet quand la connexion tombe, et la coquille
 * de l'app (polices, icônes, JS) est servie depuis le cache pour un
 * démarrage instantané depuis l'écran d'accueil.
 */

const VERSION = "revenus-v1";
const SHELL = `${VERSION}-shell`;
const OFFLINE_URL = "/hors-ligne";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon.svg"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord, page hors-ligne en dernier recours.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  // Ressources immuables de build : cache d'abord.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
