const RELOAD_GUARD_KEY = "fc_chunk_reload_once";

const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module/i;

/** Reload once after stale PWA/chunk mismatch; guarded by sessionStorage. */
export function installChunkLoadRecovery(): () => void {
  if (typeof window === "undefined") return () => {};

  function maybeRecover(reason: string) {
    if (!CHUNK_ERROR.test(reason)) return;
    try {
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
    } catch {
      return;
    }
    window.location.reload();
  }

  function onError(event: ErrorEvent) {
    maybeRecover(event.message || String(event.error ?? ""));
  }

  function onRejection(event: PromiseRejectionEvent) {
    const reason = event.reason;
    maybeRecover(reason instanceof Error ? reason.message : String(reason ?? ""));
  }

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
