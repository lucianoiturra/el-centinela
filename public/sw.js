// El Centinela — Service Worker
// Estrategia: cache-first para assets estáticos, network-first para rutas de app

const CACHE_NAME = "centinela-v1";

const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Instalar: pre-cachear assets críticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpiar caches viejas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first para API y auth, cache-first para assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API, auth y calendar: siempre network (nunca cachear datos en vivo)
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return; // dejar que el navegador maneje normalmente
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
