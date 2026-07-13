import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public health only — never expose env/DB/user diagnostics. */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
