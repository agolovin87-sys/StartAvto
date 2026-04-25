/* Share Target helper: принимает POST /share и перекладывает payload в URL + Cache Storage. */
const SHARE_CACHE = "startavto-share-target-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Обрабатываем системный Share Target (multipart/form-data -> redirect на /share?...)
  if (url.pathname === "/share" && request.method === "POST") {
    event.respondWith(
      (async () => {
        try {
          const formData = await request.clone().formData();
          const title = `${formData.get("title") || ""}`.trim();
          const text = `${formData.get("text") || ""}`.trim();
          const sharedUrl = `${formData.get("url") || ""}`.trim();
          const files = formData
            .getAll("file")
            .filter((entry) => typeof File !== "undefined" && entry instanceof File);

          const shareId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const cache = await caches.open(SHARE_CACHE);

          for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            const fileUrl = `/__shared__/${shareId}/${i}`;
            const headers = new Headers({
              "content-type": file.type || "application/octet-stream",
              "x-share-filename": encodeURIComponent(file.name || `shared-${i + 1}`),
            });
            await cache.put(fileUrl, new Response(file, { headers }));
          }

          const redirectUrl = new URL("/share", self.location.origin);
          if (title) redirectUrl.searchParams.set("title", encodeURIComponent(title));
          if (text) redirectUrl.searchParams.set("text", encodeURIComponent(text));
          if (sharedUrl) redirectUrl.searchParams.set("url", encodeURIComponent(sharedUrl));
          if (files.length > 0) {
            redirectUrl.searchParams.set("shareId", shareId);
            redirectUrl.searchParams.set("files", String(files.length));
          }
          return Response.redirect(redirectUrl.toString(), 303);
        } catch {
          return Response.redirect("/app", 303);
        }
      })()
    );
    return;
  }

  // Отдаем сохраненные шеринговые файлы обратно приложению.
  if (url.pathname.startsWith("/__shared__/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHARE_CACHE);
        const cached = await cache.match(url.pathname);
        return cached || new Response("Not found", { status: 404 });
      })()
    );
  }
});
