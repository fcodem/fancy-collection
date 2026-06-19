const DEBUG_ENDPOINT = "http://127.0.0.1:7523/ingest/9a700d11-ea30-4c25-aa1b-6eab962078af";
const DEBUG_SESSION = "5772a5";

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "audit",
) {
  const payload = {
    sessionId: DEBUG_SESSION,
    location,
    message,
    data,
    hypothesisId,
    runId,
    timestamp: Date.now(),
  };
  // #region agent log
  const send = (url: string, headers?: Record<string, string>) => {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  if (typeof window !== "undefined") {
    send("/api/debug/client-log");
    send(DEBUG_ENDPOINT, { "X-Debug-Session-Id": DEBUG_SESSION });
  } else if (typeof fetch !== "undefined") {
    send(DEBUG_ENDPOINT, { "X-Debug-Session-Id": DEBUG_SESSION });
  }
  // #endregion
}
