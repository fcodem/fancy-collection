import { AsyncSemaphore } from "@/lib/asyncSemaphore";

const SECTION_TIMEOUT_MS = 4_000;

/** Max 1 dashboard DB read at a time per instance — pool limit is 3 and auth/nav also use connections. */
export const dashboardReadSemaphore = new AsyncSemaphore(1);

function withQueryTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Dashboard query timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

/** Bounded dashboard read: semaphore slot + client-side timeout, no $transaction. */
export function runDashboardRead<T>(
  task: () => Promise<T>,
  timeoutMs = SECTION_TIMEOUT_MS,
): Promise<T> {
  return dashboardReadSemaphore.run(() => withQueryTimeout(task(), timeoutMs));
}
