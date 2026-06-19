/** Consistent INR formatting for SSR + client (fixed locale). */
export function formatInr(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString("en-IN");
}
