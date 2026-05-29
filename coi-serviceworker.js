/*
 * Injects Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 * into every response so SharedArrayBuffer / WebAssembly threading works on
 * hosts (like GitHub Pages) that cannot set custom HTTP headers.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", function (e) {
  // Skip non-GET or opaque cache-only requests
  if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;

  e.respondWith(
    fetch(e.request)
      .then(function (response) {
        if (response.status === 0) return response;

        const h = new Headers(response.headers);
        h.set("Cross-Origin-Opener-Policy", "same-origin");
        h.set("Cross-Origin-Embedder-Policy", "require-corp");
        h.set("Cross-Origin-Resource-Policy", "cross-origin");

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: h,
        });
      })
      .catch(() => fetch(e.request))
  );
});
