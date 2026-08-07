/** Pure helpers for SessionHeartbeat (testable without React). */

/** How often the client verifies the DB session is still active (single-device login). */
export const SESSION_HEARTBEAT_INTERVAL_MS = 15_000;
/** First check shortly after entering the protected app. */
export const SESSION_HEARTBEAT_INITIAL_DELAY_MS = 5_000;

/** Login page query when this device was signed out because the same ID logged in elsewhere. */
export const SESSION_SUPERSEDED_LOGIN_PARAM = "elsewhere";

export function sessionSupersededLoginPath(): string {
  return `/login?error=${SESSION_SUPERSEDED_LOGIN_PARAM}`;
}

export function skipHeartbeat(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname === "/privacy" || pathname.startsWith("/privacy/")) return true;
  if (pathname === "/data-deletion" || pathname.startsWith("/data-deletion/")) return true;
  if (pathname === "/~offline") return true;
  return false;
}

/**
 * Never call logout on pagehide — refresh also fires pagehide and would log users out.
 * Kept as a no-op for backwards-compatible imports; use the Logout button instead.
 */
export function logoutOnAppClose(): void {
  /* intentionally empty — see SessionHeartbeat */
}
