import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import { pwaRuntimeCaching } from "./src/lib/pwaRuntimeCaching";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: false,
  cacheStartUrl: false,
  customWorkerSrc: "worker",
  fallbacks: {
    document: "/~offline",
  },
  workboxOptions: {
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: pwaRuntimeCaching,
  },
});

/** Serverless-Chromium binary needed by the Puppeteer slip renderer. */
const CHROMIUM_TRACE = "./node_modules/@sparticuz/chromium/**/*";
const RUNTIME_DATA_EXCLUDES = [
  "public/uploads/**/*",
  "public/booking-bills/**/*",
  "public/admin-forensics/**/*",
  "test-results/**/*",
  "playwright-report/**/*",
  "backups/**/*",
];

const nextConfig: NextConfig = {
  // Do not ignore ESLint errors during production builds.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "puppeteer-core",
    "@sparticuz/chromium",
    "@xenova/transformers",
    "onnxruntime-node",
    "sharp",
  ],
  // Chromium is explicitly traced into EXACTLY ONE function.
  //
  // All slip PDF generation delegates to POST /api/internal/slip/render (see
  // slipHtmlPdf.server.ts), so @sparticuz/chromium is bundled only there instead
  // of into ~13 hot API routes. This keeps upload size, build time, cold starts
  // and function-size risk low. NEVER add CHROMIUM_TRACE to any other route.
  //
  // Prisma's imports plus PrismaPlugin trace the generated client/engine for the
  // routes that use it. Do not force the full client into every page and API.
  outputFileTracingIncludes: {
    "/api/internal/slip/render": [CHROMIUM_TRACE],
  },
  // Runtime/customer/generated data may exist in a developer's public folder,
  // but must never be copied into any serverless function trace.
  outputFileTracingExcludes: {
    "/api/**/*": RUNTIME_DATA_EXCLUDES,
    "/*": RUNTIME_DATA_EXCLUDES,
  },
  compress: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
    optimizePackageImports: ["@fullcalendar/react", "@fullcalendar/daygrid", "@fullcalendar/interaction"],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins = [...(config.plugins || []), new PrismaPlugin()];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com https://*.private.blob.vercel-storage.com",
              "media-src 'self' blob:",
              "font-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "connect-src 'self' https://*.vercel-storage.com https://graph.facebook.com https://*.sentry.io https://*.ably.io wss://*.ably.io",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

const configWithPwa = withPWA(nextConfig);

const sentryEnabled = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

export default sentryEnabled
  ? withSentryConfig(configWithPwa, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: false,
      disableLogger: true,
      automaticVercelMonitors: false,
    })
  : configWithPwa;
