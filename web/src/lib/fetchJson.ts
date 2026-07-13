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

export async function parseResponseJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      res.ok ? "Invalid server response" : `Request failed (${res.status})`,
      res.status,
    );
  }
}

type DedupeEntry = { promise: Promise<unknown>; expiresAt: number };
const getDedupe = new Map<string, DedupeEntry>();

function dedupeKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET") return null;
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
  return `${method}:${url}`;
}

export type FetchJsonOptions = RequestInit & {
  /** Client-side GET dedupe window (ms). Default 5s when cache is not "no-store". */
  dedupeMs?: number;
  timeoutMs?: number;
};

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: FetchJsonOptions,
): Promise<T> {
  const { dedupeMs, timeoutMs, ...rest } = init || {};
  const key = dedupeKey(input, rest);
  const dedupeWindow = dedupeMs ?? (rest.cache === "no-store" ? 0 : 5_000);

  if (key && dedupeWindow > 0) {
    const existing = getDedupe.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.promise as Promise<T>;
    }
  }

  const controller = timeoutMs && timeoutMs > 0 ? new AbortController() : null;
  const timer =
    controller && timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const run = (async () => {
    let res: Response;
    try {
      res = await fetch(input, {
        credentials: "same-origin",
        ...rest,
        signal: controller?.signal ?? rest.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      throw new ApiError(e instanceof Error ? e.message : "Network request failed", 0);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const data = await parseResponseJson<T & { error?: string }>(res);
    if (!res.ok) {
      throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
    }
    return data as T;
  })();

  if (key && dedupeWindow > 0) {
    getDedupe.set(key, { promise: run, expiresAt: Date.now() + dedupeWindow });
    run.finally(() => {
      const cur = getDedupe.get(key);
      if (cur?.promise === run) getDedupe.delete(key);
    }).catch(() => {});
  }

  return run;
}

/** Clear GET dedupe entries (e.g. after mutations that change cached reads). */
export function clearFetchJsonDedupe(prefix?: string) {
  if (!prefix) {
    getDedupe.clear();
    return;
  }
  for (const k of getDedupe.keys()) {
    if (k.includes(prefix)) getDedupe.delete(k);
  }
}
