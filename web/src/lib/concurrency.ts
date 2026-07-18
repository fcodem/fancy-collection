/**
 * Bounded concurrency helpers.
 *
 * With a Prisma connection_limit of 3, firing many independent queries through
 * an unbounded `Promise.all` can starve the pool and cause `P2024` pool
 * timeouts. Use `allLimit` / `mapLimit` to cap how many run at once while still
 * overlapping I/O.
 */

/** Run `tasks` with at most `limit` executing concurrently. Preserves order. */
export async function allLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit = 2,
): Promise<T[]> {
  const bound = Math.max(1, Math.floor(limit));
  if (tasks.length <= bound) {
    return Promise.all(tasks.map((task) => task()));
  }
  const results = new Array<T>(tasks.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]!();
    }
  }

  const workers = Array.from({ length: Math.min(bound, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Map `items` to a result with at most `limit` running concurrently. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return allLimit(
    items.map((item, index) => () => fn(item, index)),
    limit,
  );
}
