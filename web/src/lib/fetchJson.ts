export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** True for dev-server restarts, offline, or other failed fetch (not HTTP 4xx/5xx). */
export function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("network request failed") ||
    msg.includes("load failed")
  );
}

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: "same-origin", ...init });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new ApiError(e instanceof Error ? e.message : "Network request failed", 0);
  }
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
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}
