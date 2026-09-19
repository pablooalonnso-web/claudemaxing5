/*
 * Vertex service worker.
 *
 * Every figure on this site is a live chain read, so nothing that carries data is
 * ever served from cache: API responses and the RPC relay always go to the network
 * and fail loudly when they cannot. The cache exists for one job only, keeping the
 * app shell and build assets available so an installed app opens instantly and can
 * show an honest offline screen instead of a browser error.
 */
const VERSION = "vertex-v1";
const SHELL = `${VERSION}-shell`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Build output is content hashed, so it can be served from cache forever. */
const isImmutable = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/");
/** Anything that carries chain data, a quote or a verification result. */
const isLiveData = (url) => url.pathname.startsWith("/api/") || url.pathname.startsWith("/verification/");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isLiveData(url)) return; // straight to the network, never cached

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((hit) => hit ?? Response.error())));
  }
});
