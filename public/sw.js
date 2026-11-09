/*
 * Service worker for chalet40.moscow.
 * - Cache-first: /_astro/*, /assets/*, fonts, images, PDFs and other
 *   extension-bearing files (immutable or long-lived static files).
 * - Network-first: HTML pages (no file extension / .html) so content is
 *   always fresh; falls back to the cached page when offline.
 * - Never caches: /api/* (forms, consult endpoint) and non-GET requests.
 *
 * IMPORTANT: bump CACHE_VERSION on every deploy so clients pick up the
 * new caches; activate() deletes caches from older versions.
 */
const CACHE_VERSION = "2026-11-09-1";
const STATIC_CACHE = `chalet40-static-${CACHE_VERSION}`;
const PAGES_CACHE = `chalet40-pages-${CACHE_VERSION}`;
const KNOWN_CACHES = new Set([STATIC_CACHE, PAGES_CACHE]);
const CACHE_PREFIX = "chalet40-";

const STATIC_PREFIXES = ["/_astro/", "/assets/"];
const STATIC_EXTENSIONS =
  /\.(?:avif|webp|png|jpe?g|gif|svg|ico|css|js|mjs|map|woff2?|ttf|otf|eot|pdf|webmanifest|xml|txt|json)$/i;
const NEVER_CACHE_PATH = /^\/(?:api|\.well-known)\//;

function isCacheable(response) {
  if (!response || response.status !== 200) return false;
  const control = response.headers.get("Cache-Control") || "";
  if (/\bno-store\b/i.test(control) || response.headers.get("Set-Cookie")) {
    return false;
  }
  return true;
}

function isStaticPath(pathname) {
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return STATIC_EXTENSIONS.test(pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !KNOWN_CACHES.has(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE_PATH.test(url.pathname)) return;

  event.respondWith(
    isStaticPath(url.pathname) ? cacheFirst(request) : networkFirst(request),
  );
});
