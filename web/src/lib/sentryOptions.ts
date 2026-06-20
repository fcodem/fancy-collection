import type { BrowserOptions, EdgeOptions, NodeOptions } from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Shared Sentry init tuned for low overhead (errors-first, minimal tracing). */
export function baseSentryOptions(): Partial<NodeOptions & EdgeOptions & BrowserOptions> {
  const enabled = Boolean(dsn);
  return {
    dsn,
    enabled,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    // Errors are always captured when enabled; tracing is off in production to avoid overhead.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0 : 0.1,
    sendDefaultPii: false,
  };
}
