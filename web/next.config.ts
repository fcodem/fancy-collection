import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    document: "/~offline",
  },
});

const nextConfig: NextConfig = {
  // Do not let non-critical ESLint style rules abort production deploys.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "puppeteer-core",
    "@sparticuz/chromium",
    "puppeteer",
    "@xenova/transformers",
    "onnxruntime-node",
    "sharp",
  ],
  // Ensure Prisma query-engine binaries are included in Vercel serverless traces.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/.prisma/client/**/*", "./node_modules/@prisma/client/**/*"],
    "/*": ["./node_modules/.prisma/client/**/*", "./node_modules/@prisma/client/**/*"],
  },
  compress: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    optimizePackageImports: ["@prisma/client", "@fullcalendar/react", "@fullcalendar/daygrid", "@fullcalendar/interaction"],
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
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self)",
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
