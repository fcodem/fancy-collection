import { NextResponse } from "next/server";
import { requireUserReadOnly, isResponse } from "@/lib/api";
import { getServerRealtimeMode } from "@/lib/realtime/config";

export const dynamic = "force-dynamic";

/** Issue a short-lived Ably token for browser subscribe-only access. */
export async function GET() {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  if (getServerRealtimeMode() !== "ably") {
    return NextResponse.json({ error: "Ably realtime is not enabled" }, { status: 404 });
  }

  const key = process.env.ABLY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "ABLY_API_KEY not configured" }, { status: 503 });
  }

  try {
    const Ably = await import("ably");
    const rest = new Ably.Rest({ key });
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId: user.username,
      capability: JSON.stringify({ "shop": ["subscribe"] }),
      ttl: 60 * 60 * 1000,
    });
    return NextResponse.json(tokenRequest);
  } catch (err) {
    console.error("[ably/token]", err);
    return NextResponse.json({ error: "Failed to create Ably token" }, { status: 500 });
  }
}
