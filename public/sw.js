/* Network-only service worker. Caches nothing; exists so the app is installable. Bump SW_VERSION when this file changes. */
const SW_VERSION = "2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
// Settings → Diagnostics asks for the version over a MessageChannel.
self.addEventListener("message", (event) => {
  if (event.data?.type === "version") event.ports[0]?.postMessage({ version: SW_VERSION });
});
