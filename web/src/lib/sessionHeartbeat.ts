/** Pure helpers for SessionHeartbeat (testable without React). */

export const SESSION_HEARTBEAT_INTERVAL_MS = 8 * 60_000;
export const SESSION_HEARTBEAT_INITIAL_DELAY_MS = 30_000;

export function skipHeartbeat(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/privacy" || pathname.startsWith("/privacy/")) return true;
  if (pathname === "/data-deletion" || pathname.startsWith("/data-deletion/")) return true;
  if (pathname === "/~offline") return true;
  return false;
}

/** End staff session when the app/tab is closed so the next open shows login. */
export function logoutOnAppClose(): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    });
  } catch {
    /* tab may already be unloading */
  }
}
