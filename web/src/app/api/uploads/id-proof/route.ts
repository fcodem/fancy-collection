import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

/** Only proxy same-app uploads or Vercel Blob URLs — blocks open SSRF via ?url=. */
function isAllowedProofUrl(raw: string, req: NextRequest): boolean {
  const url = raw.trim();
  if (!url) return false;
  if (url.startsWith("/uploads/") || url.startsWith("uploads/") || url.startsWith("/id-proofs/")) {
    return true;
  }
  try {
    const parsed = new URL(url, req.nextUrl.origin);
    if (parsed.origin === req.nextUrl.origin && parsed.pathname.startsWith("/uploads/")) {
      return true;
    }
    if (parsed.hostname.endsWith(".public.blob.vercel-storage.com")) {
      return true;
    }
    if (parsed.hostname.endsWith(".blob.vercel-storage.com")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return jsonError("Missing url", 400);
  if (!isAllowedProofUrl(url, req)) return jsonError("URL not allowed", 403);
  try {
    const fetchUrl = url.startsWith("http") ? url : new URL(url.startsWith("/") ? url : `/${url}`, req.nextUrl.origin).toString();
    const upstream = await fetch(fetchUrl);
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
