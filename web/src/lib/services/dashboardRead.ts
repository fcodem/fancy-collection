import { AsyncSemaphore } from "@/lib/asyncSemaphore";

const SECTION_TIMEOUT_MS = 1_500;

/** Max 2 simultaneous dashboard DB reads per function instance. */
export const dashboardReadSemaphore = new AsyncSemaphore(2);

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
