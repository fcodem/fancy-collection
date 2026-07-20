import "server-only";

import { AsyncSemaphore } from "@/lib/asyncSemaphore";

/** Max simultaneous Prisma reads per serverless instance (menu/list paths). */
const readSem = new AsyncSemaphore(2);

export async function limitedDbRead<T>(task: () => Promise<T>): Promise<T> {
  return readSem.run(task);
}

export function __readDbSemaphoreForTests() {
  return readSem;
}
