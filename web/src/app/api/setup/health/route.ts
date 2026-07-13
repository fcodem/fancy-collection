import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal public health — no env/DB/user diagnostics in production. */
export async function GET() {
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return NextResponse.json({ status: "ok" });
  }

  // Local/dev only: richer diagnostics for operators.
  const sessionSecret = process.env.SESSION_SECRET?.trim() || "";
  const databaseUrl = process.env.DATABASE_URL?.trim() || "";
  return NextResponse.json({
    status: "ok",
    sessionSecretSet: sessionSecret.length > 0,
    sessionSecretLongEnough: sessionSecret.length >= 32,
    databaseUrlSet: databaseUrl.length > 0,
  });
}
