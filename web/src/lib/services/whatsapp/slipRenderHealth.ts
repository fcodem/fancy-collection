/** In-memory slip renderer health (no customer data). */
let lastRenderSuccess: string | null = null;
let lastRenderFailureCode: string | null = null;
let lastRenderFailureAt: string | null = null;
let activeRenders = 0;
let chromiumReady = false;

export function beginSlipRenderHealth(): void {
  activeRenders += 1;
}

export function endSlipRenderHealth(): void {
  activeRenders = Math.max(0, activeRenders - 1);
}

export function recordSlipRenderSuccess(): void {
  lastRenderSuccess = new Date().toISOString();
  lastRenderFailureCode = null;
  lastRenderFailureAt = null;
}

export function recordSlipRenderFailure(code: string): void {
  lastRenderFailureCode = code;
  lastRenderFailureAt = new Date().toISOString();
}

export function setChromiumReady(ready: boolean): void {
  chromiumReady = ready;
}

export function getSlipRenderHealthSnapshot() {
  return {
    chromiumReady,
    activeRenders,
    lastRenderSuccess,
    lastRenderFailureCode,
    lastRenderFailureAt,
  };
}
