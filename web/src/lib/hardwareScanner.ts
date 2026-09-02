import { parseQrScanPayload } from "@/lib/bookingQrClient";

/** Max gap between keystrokes to treat input as a USB wedge scanner (not human typing). */
export const HARDWARE_SCAN_MAX_GAP_MS = 50;

export function isBookingQrScanPayload(raw: string): boolean {
  const parsed = parseQrScanPayload(raw);
  return Boolean(parsed?.token && parsed.sig);
}

export function normalizeHardwareScanCode(raw: string): string {
  return raw.replace(/[\r\n\u2028\u2029]+/g, "").trim();
}

export type HardwareScanListenerOptions = {
  onScan: (code: string) => boolean | void;
  minLength?: number;
  maxGapMs?: number;
  /** When false, the listener is inactive. */
  enabled?: () => boolean;
};

/**
 * Document-level USB barcode wedge listener.
 * Detects rapid key bursts terminated by Enter — works even when no input is focused.
 */
export function attachHardwareScanListener(options: HardwareScanListenerOptions): () => void {
  const minLength = options.minLength ?? 4;
  const maxGapMs = options.maxGapMs ?? HARDWARE_SCAN_MAX_GAP_MS;

  let buffer = "";
  let lastAt = 0;
  let rapidCount = 0;

  function reset() {
    buffer = "";
    lastAt = 0;
    rapidCount = 0;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (options.enabled && !options.enabled()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isComposing) return;

    if (e.key === "Enter") {
      const code = normalizeHardwareScanCode(buffer);
      if (code.length >= minLength && rapidCount >= Math.min(3, code.length)) {
        const handled = options.onScan(code);
        if (handled !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
      reset();
      return;
    }

    if (e.key.length !== 1) return;

    const now = Date.now();
    const gap = lastAt ? now - lastAt : 0;

    if (lastAt && gap > maxGapMs) {
      buffer = e.key;
      rapidCount = 1;
    } else {
      buffer += e.key;
      rapidCount += 1;
    }
    lastAt = now;
  }

  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    reset();
  };
}

/** Refocus helper — safe after alerts and async work on tablets with USB hubs. */
export function refocusInput(el: HTMLInputElement | null | undefined, delayMs = 0) {
  if (!el) return;
  const run = () => {
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  };
  if (delayMs > 0) window.setTimeout(run, delayMs);
  else requestAnimationFrame(run);
}
