"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { BrandLogo } from "@/components/BrandMark";
import { BRAND_APP_TITLE } from "@/lib/branding";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const message =
    process.env.NODE_ENV === "production"
      ? "An unexpected error occurred. Please refresh the page or contact support."
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);

  return (
    <div className="login-page">
      <div className="card login-card">
        <div className="login-brand">
          <BrandLogo size={56} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 8 }}>{BRAND_APP_TITLE}</div>
          <div className="brand-icon" style={{ margin: "0 auto 12px", width: 48, height: 48, fontSize: 22 }}>⚠️</div>
          <h1>Something went wrong</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{message}</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="btn btn-primary btn-block"
            onClick={reset}>Try again</button>
          <Link href="/" className="btn btn-outline btn-block"
            style={{ textAlign: "center" }}>Go home</Link>
        </div>
      </div>
    </div>
  );
}
