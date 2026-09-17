import { parseQrScanPayload } from "@/lib/bookingQrClient";

/** Max gap between keystrokes to treat input as a USB wedge scanner (not human typing). */
export const HARDWARE_SCAN_MAX_GAP_MS = 50;

/** Min rapid keystrokes before Enter counts as a hardware scan burst. */
export const HARDWARE_SCAN_MIN_RAPID_KEYS = 3;

export function isBookingQrScanPayload(raw: string): boolean {
  const parsed = parseQrScanPayload(raw);
  return Boolean(parsed?.token && parsed.sig);
}

export function normalizeHardwareScanCode(raw: string): string {
  return raw.replace(/[\r\n\u2028\u2029]+/g, "").trim();
}

/**
 * True when typed/scanned text is a QR/barcode/SKU — not a dress name.
 * Dress names usually have spaces or are letter-only words; scan codes are compact
 * and include digits, separators, or booking QR URL shape.
 */
export function looksLikeDressScanCode(raw: string): boolean {
  const code = normalizeHardwareScanCode(raw);
  if (!code || code.length < 3) return false;
  if (/\s/.test(code)) return false;

  if (isBookingQrScanPayload(code)) return true;
  if (/\/booking\/qr\//i.test(code)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
    return true;
  }
  // Numeric barcode / serial
  if (/^\d{4,}$/.test(code)) return true;
  // SKU / internal codes: must include a digit or separator (avoids "LEHENGA", "ANARKALI")
  if (
    /^[A-Za-z0-9._\-]+$/.test(code) &&
    /[\d\-_]/.test(code) &&
    code.length >= 4 &&
    code.length <= 128
  ) {
    return true;
  }
  return false;
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
