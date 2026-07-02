import { unstable_cache } from "next/cache";

/** Short-lived server cache for read-heavy list/aggregate endpoints (30–60s). */
export function cachedQuery<T>(
  key: string[],
  fn: () => Promise<T>,
  revalidateSeconds = 30,
): Promise<T> {
  return unstable_cache(fn, key, { revalidate: revalidateSeconds, tags: [key[0]] })();
}
