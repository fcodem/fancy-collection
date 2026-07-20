let renderQueue: Promise<unknown> = Promise.resolve();

export function enqueueSlipRender<T>(fn: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(fn, fn);
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function getSlipRenderQueueTail(): Promise<unknown> {
  return renderQueue;
}

export function resetSlipRenderQueueForTests(): void {
  renderQueue = Promise.resolve();
}
