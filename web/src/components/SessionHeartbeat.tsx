"use client";

import { useEffect } from "react";
import { parseResponseJson } from "@/lib/fetchJson";
import { usePathname, useRouter } from "next/navigation";

let lastCheckedAt = 0;
let inFlight: Promise<void> | null = null;
/** Background revalidation only — not on every navigation. */
const INTERVAL_MS = 8 * 60_000;
const INITIAL_DELAY_MS = 30_000;

function skipHeartbeat(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/privacy" || pathname.startsWith("/privacy/")) return true;
  if (pathname === "/data-deletion" || pathname.startsWith("/data-deletion/")) return true;
  if (pathname === "/~offline") return true;
  return false;
}

async function checkSessionOnce(router: ReturnType<typeof useRouter>) {
  const now = Date.now();
  if (now - lastCheckedAt < INTERVAL_MS / 2) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    lastCheckedAt = Date.now();
    try {
      const res = await fetch("/api/session/check", { cache: "no-store" });
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      const data = await parseResponseJson<{ active?: boolean }>(res);
      if (!data.active) router.replace("/login");
    } catch {
      // network error — do not redirect (user may be offline)
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Single shell-level session probe. Does not restart timers on every route change.
 */
export default function SessionHeartbeat() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (skipHeartbeat(pathname)) return;

    const initial = setTimeout(() => {
      void checkSessionOnce(router);
    }, INITIAL_DELAY_MS);
    const id = setInterval(() => {
      void checkSessionOnce(router);
    }, INTERVAL_MS);

    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
    // Intentionally omit pathname — navigation must not re-bind timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return null;
}

/** Call after login / logout / password change to force a fresh check soon. */
export function invalidateSessionHeartbeatCache() {
  lastCheckedAt = 0;
}
