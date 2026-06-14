// El Centinela — Service Worker
// Estrategia: cache-first para assets estáticos, network-first para rutas de app

const CACHE_NAME = "centinela-v3";

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

  // API y rutas dinámicas de Next: siempre network (nunca cachear datos en vivo).
  // /_next/static/ SÍ se cachea (bundles inmutables con hash en el nombre): cae al
  // bloque cache-first del final, lo que permite que la app cargue offline.
  if (
    url.pathname.startsWith("/api/") ||
    (url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/_next/static/"))
  ) {
    return; // dejar que el navegador maneje normalmente
  }

  // Navegaciones (documentos HTML): network-first. Cache-first congelaba el shell
  // y los nuevos deploys nunca se veían. Online → red (y refresca caché); offline
  // → cae al documento cacheado, o al "/" como último recurso.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
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
