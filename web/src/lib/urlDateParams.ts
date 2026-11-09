const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validated `YYYY-MM-DD` from a query param, else the fallback. */
export function isoDateParam(value: string | string[] | undefined, fallback: string): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && ISO_DATE.test(v) ? v : fallback;
}

/** Keeps chosen dates in the address bar so a reload reopens the same period. */
export function writeDateParamsToUrl(params: Record<string, string>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const [key, value] of Object.entries(params)) {
    const next = value && ISO_DATE.test(value) ? value : "";
    if ((url.searchParams.get(key) || "") === next) continue;
    if (next) url.searchParams.set(key, next);
    else url.searchParams.delete(key);
    changed = true;
  }
  if (changed) window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
