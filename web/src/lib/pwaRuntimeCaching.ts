import type { RuntimeCaching } from "workbox-build";

const ONE_WEEK = 7 * 24 * 60 * 60;
const THREE_DAYS = 3 * 24 * 60 * 60;

/**
 * Workbox runtime caching for the generated service worker (`public/sw.js`).
 * Sensitive HTML and API responses stay network-only; static assets and public
 * inventory thumbnails may cache with bounded expiration.
 */
export const pwaRuntimeCaching: RuntimeCaching[] = [
  /* ── Never cache authenticated / mutation APIs ── */
  {
    urlPattern: /^\/api\//i,
    handler: "NetworkOnly",
  },
  /* ── App HTML navigations (business data) — network only ── */
  {
    urlPattern: ({ request }) => request.mode === "navigate",
    handler: "NetworkOnly",
  },
  /* ── Versioned Next.js JS/CSS ── */
  {
    urlPattern: /^\/_next\/static\/.*/i,
    handler: "CacheFirst",
    options: {
      cacheName: "next-static-assets-v1",
      expiration: { maxEntries: 256, maxAgeSeconds: ONE_WEEK },
    },
  },
  /* ── Web fonts ── */
  {
    urlPattern: /\.(?:woff2?|ttf|otf|eot)$/i,
    handler: "CacheFirst",
    options: {
      cacheName: "static-fonts-v1",
      expiration: { maxEntries: 32, maxAgeSeconds: ONE_WEEK * 4 },
    },
  },
  /* ── Public icons, emoji, brand images ── */
  {
    urlPattern: /^\/(?:icon-|emoji\/|images\/)/i,
    handler: "CacheFirst",
    options: {
      cacheName: "static-icons-v1",
      expiration: { maxEntries: 64, maxAgeSeconds: ONE_WEEK * 4 },
    },
  },
  /* ── Public inventory thumbnail / catalog blobs ── */
  {
    urlPattern: /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/.*/i,
    handler: "CacheFirst",
    options: {
      cacheName: "inventory-thumbs-v1",
      expiration: { maxEntries: 200, maxAgeSeconds: THREE_DAYS },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
];
