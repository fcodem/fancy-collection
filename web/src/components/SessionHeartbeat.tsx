"use client";

import { useEffect } from "react";
import { parseResponseJson } from "@/lib/fetchJson";
import { usePathname, useRouter } from "next/navigation";

let lastCheckedAt = 0;
const INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 15_000;

function skipHeartbeat(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/privacy" || pathname.startsWith("/privacy/")) return true;
  if (pathname === "/data-deletion" || pathname.startsWith("/data-deletion/")) return true;
  if (pathname === "/~offline") return true;
  return false;
}

export default function SessionHeartbeat() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (skipHeartbeat(pathname)) return;

    async function checkSession() {
      const now = Date.now();
      if (now - lastCheckedAt < INTERVAL_MS / 2) return;
      lastCheckedAt = now;
      try {
        const res = await fetch("/api/session/check");
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const data = await parseResponseJson<{ active?: boolean }>(res);
        if (!data.active) router.replace("/login");
      } catch {
        // network error — do not redirect (user may be offline)
      }
    }

    const initial = setTimeout(checkSession, INITIAL_DELAY_MS);
    const id = setInterval(checkSession, INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [pathname, router]);

  return null;
}
