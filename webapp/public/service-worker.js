const CACHE_NAME = "travel-planner-shell-v1905";
const SHELL_ASSETS = [
  "/",
  "/install.html",
  "/plan.html",
  "/style.css",
  "/auth.js",
  "/app.js",
  "/plan.js",
  "/pwa.js",
  "/health.json",
  "/ios-launch-proof.schema.json",
  "/icon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function navigationFallbackPath(pathname) {
  if (pathname === "/i" || pathname === "/iphone" || pathname === "/install") return "/install.html";
  if (pathname === "/install.html") return "/install.html";
  if (pathname === "/ios-install-status" || pathname === "/ios-next") return "/install.html";
  if (pathname.startsWith("/plans/")) return "/plan.html";
  return "/";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(navigationFallbackPath(url.pathname)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
