import { NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { readFile } from "fs/promises";
import { join } from "path";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

/** Only proxy same-app uploads or Vercel Blob URLs — blocks open SSRF via ?url=. */
function isAllowedProofUrl(raw: string, req: NextRequest): boolean {
  const url = raw.trim();
  if (!url) return false;
  if (
    url.startsWith("/uploads/") ||
    url.startsWith("uploads/") ||
    url.startsWith("/id-proofs/") ||
    url.startsWith("id-proofs/")
  ) {
    return true;
  }
  try {
    const parsed = new URL(url, req.nextUrl.origin);
    if (parsed.origin === req.nextUrl.origin && parsed.pathname.startsWith("/uploads/")) {
      return true;
    }
    if (
      parsed.hostname.endsWith(".public.blob.vercel-storage.com") ||
      parsed.hostname.endsWith(".blob.vercel-storage.com") ||
      parsed.hostname.endsWith(".private.blob.vercel-storage.com")
    ) {
      // Only allow id-proof pathnames when possible.
      if (!/id-proof/i.test(parsed.pathname) && !/uploads\/id-proofs/i.test(parsed.pathname)) {
        return false;
      }
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
    if (url.startsWith("http://") || url.startsWith("https://")) {
      // Authenticated download for private (and legacy public) Blob objects.
      try {
        const result = await get(url, {
          access: "private",
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        if (result?.stream) {
          return new Response(result.stream as unknown as BodyInit, {
            headers: {
              "Content-Type": result.blob.contentType || "image/jpeg",
              "Cache-Control": "private, no-store",
            },
          });
        }
      } catch {
        // Fall through to public fetch for legacy public blobs.
      }
      const upstream = await fetch(url);
      if (!upstream.ok) return jsonError("Not found", 404);
      return new Response(upstream.body, {
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
          "Cache-Control": "private, no-store",
        },
      });
    }

    const rel = url.replace(/^\//, "");
    const localPath = join(process.cwd(), "public", rel.startsWith("uploads/") ? rel : `uploads/${rel}`);
    const bytes = await readFile(localPath);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return jsonError("Failed to fetch file", 500);
  }
}
