import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return jsonError("Missing url", 400);
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return jsonError("Not found", 404);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return jsonError("Failed to fetch file", 500);
  }
}
