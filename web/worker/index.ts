/// <reference lib="webworker" />

/**
 * Custom service worker fragment merged into generated `public/sw.js`.
 * Purges caches from older PWA builds on activate.
 */

const KEEP_CACHE_PREFIXES = [
  "next-static-assets-v1",
  "static-fonts-v1",
  "static-icons-v1",
  "inventory-thumbs-v1",
  "workbox-precache-v2",
];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((name) => !KEEP_CACHE_PREFIXES.some((p) => name.startsWith(p)))
          .map((name) => caches.delete(name)),
      );
    })(),
  );
});

export {};
