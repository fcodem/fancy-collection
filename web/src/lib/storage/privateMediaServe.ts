import { NextRequest } from "next/server";
import { get, issueSignedToken, presignUrl } from "@vercel/blob";
import { readFile } from "fs/promises";
import { join } from "path";
import { getCurrentUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getClientIpFromRequest } from "@/lib/loginRateLimit";
import {
  APPROVED_PRIVATE_MEDIA_FOLDERS,
  requirePrivateMediaToken,
} from "./privateBookingMedia";

const PRIVATE_FOLDER_PATTERN = APPROVED_PRIVATE_MEDIA_FOLDERS.join("|");

function matchesApprovedPrivatePath(pathOrUrl: string): boolean {
  const normalized = pathOrUrl.replace(/^\//, "").replace(/^uploads\//, "");
  if (/^private\//i.test(normalized)) {
    return new RegExp(`^private\\/(${PRIVATE_FOLDER_PATTERN})\\/`, "i").test(normalized);
  }
  return new RegExp(`^(${PRIVATE_FOLDER_PATTERN})\\/`, "i").test(normalized);
}

/** Blocks open SSRF via ?url= — only same-app private booking paths. */
export function isAllowedPrivateMediaUrl(raw: string, req: NextRequest): boolean {
  const url = raw.trim();
  if (!url) return false;

  if (url.startsWith("/") || url.startsWith("uploads/")) {
    return matchesApprovedPrivatePath(url);
  }

  try {
    const parsed = new URL(url, req.nextUrl.origin);
    if (parsed.origin === req.nextUrl.origin) {
      return matchesApprovedPrivatePath(parsed.pathname);
    }
    if (
      parsed.hostname.endsWith(".private.blob.vercel-storage.com") ||
      parsed.hostname.endsWith(".blob.vercel-storage.com")
    ) {
      return matchesApprovedPrivatePath(parsed.pathname);
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
    token = requirePrivateMediaToken();
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

export async function servePrivateMedia(req: NextRequest, rateLimitKey: string) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const ip = getClientIpFromRequest(req);
  const rate = enforceRateLimit(`${rateLimitKey}:${user.id}:${ip}`, 60, 60_000);
  if (!rate.allowed) return jsonError("Too many requests", 429);

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return jsonError("Missing url", 400);
  if (!isAllowedPrivateMediaUrl(url, req)) return jsonError("URL not allowed", 403);

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
        const token = requirePrivateMediaToken();
        const result = await get(url, {
          access: "private",
          token,
        });
        if (result?.stream) {
          return new Response(result.stream as unknown as BodyInit, {
            headers: privateResponseHeaders(result.blob.contentType || "image/jpeg"),
          });
        }
      } catch {
        /* private fetch failed */
      }
      return jsonError("Not found", 404);
    }

    const rel = url.replace(/^\//, "");
    const localPath = join(
      process.cwd(),
      "public",
      rel.startsWith("uploads/") ? rel : `uploads/${rel}`,
    );
    const bytes = await readFile(localPath);
    return new Response(bytes, {
      headers: privateResponseHeaders("image/jpeg"),
    });
  } catch {
    return jsonError("Failed to fetch file", 500);
  }
}
