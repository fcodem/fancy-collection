export async function fetchFinanceJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Failed to load finance data (${res.status})`,
    );
  }
  return body as T;
}
