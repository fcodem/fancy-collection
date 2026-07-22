"use client";

import { useEffect } from "react";
import { parseResponseJson } from "@/lib/fetchJson";
import { usePathname, useRouter } from "next/navigation";
import {
  SESSION_HEARTBEAT_INITIAL_DELAY_MS,
  SESSION_HEARTBEAT_INTERVAL_MS,
  logoutOnAppClose,
  skipHeartbeat,
} from "@/lib/sessionHeartbeat";

export {
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_HEARTBEAT_INITIAL_DELAY_MS,
  skipHeartbeat,
} from "@/lib/sessionHeartbeat";

let lastCheckedAt = 0;
let inFlight: Promise<void> | null = null;

async function checkSessionOnce(router: { replace: (href: string) => void }) {
  const now = Date.now();
  if (now - lastCheckedAt < SESSION_HEARTBEAT_INTERVAL_MS / 2) return;
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
 * Shell-level session probe.
 * Timers start when entering the protected app (from login/public) and stop when leaving.
 * Navigating between protected pages does not recreate timers (`shouldSkipHeartbeat` stays false).
 */
export default function SessionHeartbeat() {
  const router = useRouter();
  const pathname = usePathname();
  const shouldSkipHeartbeat = skipHeartbeat(pathname);

  useEffect(() => {
    if (shouldSkipHeartbeat) return;

    const onPageHide = () => {
      logoutOnAppClose();
    };

    const initial = setTimeout(() => {
      void checkSessionOnce(router);
    }, SESSION_HEARTBEAT_INITIAL_DELAY_MS);
    const id = setInterval(() => {
      void checkSessionOnce(router);
    }, SESSION_HEARTBEAT_INTERVAL_MS);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearTimeout(initial);
      clearInterval(id);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [router, shouldSkipHeartbeat]);

  return null;
}

/** Call after login / logout / password change to force a fresh check soon. */
export function invalidateSessionHeartbeatCache() {
  lastCheckedAt = 0;
}
