import { NextRequest } from "next/server";
import { get, issueSignedToken, presignUrl } from "@vercel/blob";
import { readFile } from "fs/promises";
import { join } from "path";
import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getClientIpFromRequest } from "@/lib/loginRateLimit";
import { requireIdProofBlobToken } from "@/lib/upload";

/** Only proxy same-app uploads or private ID-proof Blob URLs — blocks open SSRF via ?url=. */
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

function blobPathname(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

function privateResponseHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

async function signedGetUrl(blobUrl: string): Promise<string | null> {
  const pathname = blobPathname(blobUrl);
  if (!pathname) return null;
  let token: string;
  try {
    token = requireIdProofBlobToken();
  } catch {
    return null;
  }
  const validUntil = Date.now() + 90_000;
  const issued = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
    token,
  });
  const { presignedUrl } = await presignUrl(issued, {
    operation: "get",
    pathname,
    access: "private",
    validUntil,
    useCache: false,
  });
  return presignedUrl;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const ip = getClientIpFromRequest(req);
  const rate = enforceRateLimit(`id-proof:${user.id}:${ip}`, 60, 60_000);
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return jsonError("Missing url", 400);
  if (!isAllowedProofUrl(url, req)) return jsonError("URL not allowed", 403);

  const wantSigned = req.nextUrl.searchParams.get("format") === "signed";

  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      if (wantSigned) {
        try {
          const signed = await signedGetUrl(url);
          if (signed) {
            return jsonOk({ url: signed, expiresInSec: 90 });
          }
        } catch {
          /* fall through to authenticated stream */
        }
      }

      try {
        let token: string | undefined;
        try {
          token = requireIdProofBlobToken();
        } catch {
          token = undefined;
        }
        if (token) {
          const result = await get(url, {
            access: "private",
            token,
          });
          if (result?.stream) {
            return new Response(result.stream as unknown as BodyInit, {
              headers: privateResponseHeaders(result.blob.contentType || "image/jpeg"),
            });
          }
        }
      } catch {
        // Legacy public blobs for historical id-proof paths only.
      }
      const upstream = await fetch(url);
      if (!upstream.ok) return jsonError("Not found", 404);
      return new Response(upstream.body, {
        headers: privateResponseHeaders(upstream.headers.get("Content-Type") ?? "image/jpeg"),
      });
    }

    const rel = url.replace(/^\//, "");
    const localPath = join(process.cwd(), "public", rel.startsWith("uploads/") ? rel : `uploads/${rel}`);
    const bytes = await readFile(localPath);
    return new Response(bytes, {
      headers: privateResponseHeaders("image/jpeg"),
    });
  } catch {
    return jsonError("Failed to fetch file", 500);
  }
}
