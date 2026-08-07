/** Fired when the user opens a menu / route so list UIs can refetch. */
export const PAGE_OPEN_REFRESH_EVENT = "fc-page-open-refresh";

export function dispatchPageOpenRefresh(reason: "navigate" | "focus" | "visible" = "navigate"): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(PAGE_OPEN_REFRESH_EVENT, {
        detail: { reason, at: new Date().toISOString() },
      }),
    );
  } catch {
    /* ignore */
  }
}
