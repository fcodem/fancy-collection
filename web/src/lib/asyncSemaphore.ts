/** Limits how many async tasks run at once within one runtime instance. */
export class AsyncSemaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {
    if (maxConcurrent < 1) {
      throw new RangeError("AsyncSemaphore maxConcurrent must be at least 1");
    }
  }

  /** Run `task` when a slot is available. */
  run<T>(task: () => Promise<T>): Promise<T> {
    return this.acquire().then(async () => {
      try {
        return await task();
      } finally {
        this.release();
      }
    });
  }

  /** Test helper — current in-flight task count. */
  getActiveCount(): number {
    return this.active;
  }

  /** Test helper — tasks waiting for a slot. */
  getWaitingCount(): number {
    return this.queue.length;
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}
