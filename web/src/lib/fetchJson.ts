export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, { credentials: "same-origin", ...init });
  const text = await res.text();
  let data: T & { error?: string } = {} as T & { error?: string };
  if (text) {
    try {
      data = JSON.parse(text) as T & { error?: string };
    } catch {
      throw new ApiError(
        res.ok ? "Invalid server response" : `Request failed (${res.status})`,
        res.status,
      );
    }
  }
  if (!res.ok) {
    // #region agent log
    const { debugLog } = await import("./debugLog");
    debugLog("fetchJson.ts", "request failed", { url: String(input), status: res.status, error: data.error }, "C");
    // #endregion
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}
