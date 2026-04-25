/* Минимальный SW: без кэша страниц — только чтобы браузер считал сайт установляемым (PWA). */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
