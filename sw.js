const CACHE_NAME = "boolinator-v1.0.36";

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/style.css",
  "./src/main.js",
  "./src/booleanEngine.js",
  "./images/theBoolinator.png",
  "./images/theBoolinator180.png",
  "./images/theBoolinator192.png",
  "./images/screenshot.png",
];

function toScopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function cacheFirstWithBackgroundRefresh(request, options = {}) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, options);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return { response: cached, background: networkPromise };
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return { response: networkResponse, background: null };
  }

  return { response: null, background: null };
}

async function getCachedAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const candidates = [
    toScopeUrl("./index.html"),
    toScopeUrl("./"),
  ];

  for (const candidate of candidates) {
    const match = await cache.match(candidate, { ignoreSearch: true });
    if (match) {
      return match;
    }
  }

  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_ASSETS.map((asset) => toScopeUrl(asset)));
  })());

  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === "navigate";
  const isStaticAsset = ["script", "style", "image", "font"].includes(request.destination);

  // Same-origin page requests: cache-first for instant open, refresh in background.
  if (isNavigation && isSameOrigin) {
    event.respondWith((async () => {
      const { response, background } = await cacheFirstWithBackgroundRefresh(request, { ignoreSearch: true });
      if (background) {
        event.waitUntil(background);
      }

      if (response) {
        return response;
      }

      try {
        return await fetch(request);
      } catch {
        const shell = await getCachedAppShell();
        if (shell) {
          return shell;
        }

        throw new Error("Offline and no cached app shell available.");
      }
    })());

    return;
  }

  if (isSameOrigin && isStaticAsset) {
    event.respondWith((async () => {
      const { response, background } = await cacheFirstWithBackgroundRefresh(request, { ignoreSearch: true });
      if (background) {
        event.waitUntil(background);
      }

      if (response) {
        return response;
      }

      return fetch(request);
    })());

    return;
  }

  // Default GET behavior: network-first with cache fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && isSameOrigin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) {
          return cached;
        }

        if (isNavigation) {
          const shell = await getCachedAppShell();
          if (shell) {
            return shell;
          }
        }

        throw new Error("Request failed and no cache fallback found.");
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
  })());

  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
