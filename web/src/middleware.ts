import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidPdfRenderSecret } from "@/lib/slipPdfAccess";

/** Paths that do not require a session cookie (pages + public APIs). */
const PUBLIC_PATHS = [
  "/login",
  "/login/pending",
  "/privacy",
  "/privacy.html",
  "/data-deletion",
  "/data-deletion.html",
  "/api/login",
  "/api/login-request/status",
  "/api/login-request/complete",
  "/api/session/check",
  "/api/health",
  "/api/public/",
  "/api/whatsapp/webhook",
  "/api/cron/",
];

const SLIP_PDF_PATH = /^\/booking\/\d+\/(slip|delivery-slip|return-slip|incomplete-slip)(\/|$)/;

const PWA_ASSET_PATHS = [
  "/manifest.json",
  "/sw.js",
  "/~offline",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return true;
  if (PWA_ASSET_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/workbox-")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/static")) return true;
  if (pathname.startsWith("/css")) return true;
  if (pathname.startsWith("/js")) return true;
  // Catalogue/media under /uploads is public; identity documents are never public.
  if (pathname.startsWith("/uploads/id-proofs") || pathname.startsWith("/id-proofs")) {
    return false;
  }
  if (pathname.startsWith("/uploads")) return true;
  if (pathname === "/favicon.ico") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const passThrough = () => {
    const res = NextResponse.next();
    res.headers.set("x-pathname", pathname);
    return res;
  };

  if (isPublicPath(pathname)) {
    return passThrough();
  }

  // Headless PDF generation fetches slip pages without a staff session cookie.
  const pdfSecret = request.nextUrl.searchParams.get("pdfSecret");
  if (SLIP_PDF_PATH.test(pathname) && isValidPdfRenderSecret(pdfSecret)) {
    return passThrough();
  }

  // The single internal Chromium renderer is a server-to-server call (no cookie),
  // authenticated by the PDF render secret header.
  if (
    pathname === "/api/internal/slip/render" &&
    isValidPdfRenderSecret(request.headers.get("x-pdf-secret"))
  ) {
    return passThrough();
  }

  // Setup routes are never public in production / on Vercel.
  if (pathname.startsWith("/api/setup/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sessionCookie = request.cookies.get("fancy_collection_session");
  if (!sessionCookie?.value) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return passThrough();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
