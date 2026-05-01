// Migration service worker.
// Replaces the old workbox SW. Activates immediately, wipes caches,
// unregisters itself, and reloads any open clients so they see the
// migration page (which then sends them to md-editor.elidesmet.nl).

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          await client.navigate(client.url);
        } catch {}
      }
    })(),
  );
});
