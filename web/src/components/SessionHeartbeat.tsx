"use client";

import { useEffect } from "react";
import { parseResponseJson } from "@/lib/fetchJson";
import { usePathname, useRouter } from "next/navigation";
import {
  SESSION_HEARTBEAT_INITIAL_DELAY_MS,
  SESSION_HEARTBEAT_INTERVAL_MS,
  sessionSupersededLoginPath,
  skipHeartbeat,
} from "@/lib/sessionHeartbeat";

export {
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_HEARTBEAT_INITIAL_DELAY_MS,
  SESSION_SUPERSEDED_LOGIN_PARAM,
  sessionSupersededLoginPath,
  skipHeartbeat,
} from "@/lib/sessionHeartbeat";

let lastCheckedAt = 0;
let inFlight: Promise<void> | null = null;
let redirectedForInactive = false;

async function clearSessionCookie() {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
  } catch {
    // network error — still redirect so user cannot keep using stale UI
  }
}

async function redirectToLogin(router: { replace: (href: string) => void }) {
  if (redirectedForInactive) return;
  redirectedForInactive = true;
  await clearSessionCookie();
  router.replace(sessionSupersededLoginPath());
}

async function checkSessionOnce(router: { replace: (href: string) => void }) {
  const now = Date.now();
  if (now - lastCheckedAt < SESSION_HEARTBEAT_INTERVAL_MS / 2) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    lastCheckedAt = Date.now();
    try {
      const res = await fetch("/api/session/check", { cache: "no-store" });
      if (!res.ok) {
        await redirectToLogin(router);
        return;
      }
      const data = await parseResponseJson<{ active?: boolean }>(res);
      if (!data.active) await redirectToLogin(router);
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
 *
 * IMPORTANT: do not logout on pagehide — browser refresh also fires pagehide.
 */
export default function SessionHeartbeat() {
  const router = useRouter();
  const pathname = usePathname();
  const shouldSkipHeartbeat = skipHeartbeat(pathname);

  useEffect(() => {
    if (shouldSkipHeartbeat) return;

    redirectedForInactive = false;

    const initial = setTimeout(() => {
      void checkSessionOnce(router);
    }, SESSION_HEARTBEAT_INITIAL_DELAY_MS);
    const id = setInterval(() => {
      void checkSessionOnce(router);
    }, SESSION_HEARTBEAT_INTERVAL_MS);

    const onResume = () => {
      if (document.hidden) return;
      lastCheckedAt = 0;
      void checkSessionOnce(router);
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);

    return () => {
      clearTimeout(initial);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [router, shouldSkipHeartbeat]);

  return null;
}

/** Call after login / logout / password change to force a fresh check soon. */
export function invalidateSessionHeartbeatCache() {
  lastCheckedAt = 0;
  redirectedForInactive = false;
}
