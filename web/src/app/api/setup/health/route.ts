import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public first-run diagnostics (no secrets returned). */
export async function GET() {
  const sessionSecret = process.env.SESSION_SECRET?.trim() || "";
  const databaseUrl = process.env.DATABASE_URL?.trim() || "";
  const result: Record<string, unknown> = {
    ok: true,
    sessionSecretSet: sessionSecret.length > 0,
    sessionSecretLongEnough: sessionSecret.length >= 32,
    databaseUrlSet: databaseUrl.length > 0,
    databaseLooksLikePooler6543: /:6543\b/.test(databaseUrl),
    databaseLooksLikeDirectDbHost: /@db\.[a-z0-9]+\.supabase\.co:/i.test(databaseUrl),
    userCount: null as number | null,
    dbOk: false,
    needsBootstrap: false,
    hint: "",
  };

  try {
    const userCount = await prisma.user.count();
    result.userCount = userCount;
    result.dbOk = true;
    result.needsBootstrap = userCount === 0;
    if (userCount === 0) {
      result.hint = "No users yet. POST /api/setup/bootstrap-owner or run the SQL insert for owner/admin123.";
    } else if (!result.sessionSecretLongEnough) {
      result.hint = "Set SESSION_SECRET to 32+ characters in Vercel Production, then Redeploy.";
    } else {
      result.hint = "DB reachable. Login with owner / admin123 (lowercase) if using default seed.";
    }
  } catch (e) {
    result.ok = false;
    result.dbOk = false;
    result.dbError = e instanceof Error ? e.message : String(e);
    result.hint =
      "Database query failed. Fix DATABASE_URL / DIRECT_URL (pooler) and Redeploy latest main.";
  }

  return NextResponse.json(result);
}
