import { NextRequest, NextResponse } from "next/server";
import { endUserSession } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

/** Logout is POST-only so Next.js link prefetch can never destroy a session. */
export async function GET() {
  return NextResponse.json({ error: "Use POST to log out." }, { status: 405 });
}

export async function POST(_req: NextRequest) {
  await endUserSession();
  return jsonOk({ ok: true });
}
