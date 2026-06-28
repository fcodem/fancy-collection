import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/login/pending", "/api/login", "/api/login-request/status", "/api/login-request/complete", "/api/session/check"];

const PWA_ASSET_PATHS = [
  "/manifest.json",
  "/sw.js",
  "/~offline",
  "/icon-192x192.png",
  "/icon-512x512.png",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const passThrough = () => {
    const res = NextResponse.next();
    res.headers.set("x-pathname", pathname);
    return res;
  };

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    PWA_ASSET_PATHS.includes(pathname) ||
    pathname.startsWith("/workbox-") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/css") ||
    pathname.startsWith("/js") ||
    pathname.startsWith("/uploads") ||
    pathname === "/favicon.ico"
  ) {
    return passThrough();
  }

  const sessionCookie = request.cookies.get("fancy_collection_session");
  if (!sessionCookie?.value && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return passThrough();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
