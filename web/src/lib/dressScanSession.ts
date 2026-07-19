export const SCAN_DUPLICATE_LOCK_MS = 1_500;

export type ScanWindowInput = {
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
};

export type ValidatedScanWindow = ScanWindowInput & {
  deliveryDateTime: string;
  returnDateTime: string;
};

export class ScanWindowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanWindowValidationError";
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Build explicit Asia/Kolkata instants; never rely on browser/server timezone. */
export function validateScanWindow(input: ScanWindowInput): ValidatedScanWindow {
  if (!input.deliveryDate) throw new ScanWindowValidationError("Delivery date is required.");
  if (!input.deliveryTime) throw new ScanWindowValidationError("Delivery time is required.");
  if (!input.returnDate) throw new ScanWindowValidationError("Return date is required.");
  if (!input.returnTime) throw new ScanWindowValidationError("Return time is required.");
  if (!validDate(input.deliveryDate) || !validDate(input.returnDate)) {
    throw new ScanWindowValidationError("Enter valid delivery and return dates.");
  }
  if (!TIME_RE.test(input.deliveryTime) || !TIME_RE.test(input.returnTime)) {
    throw new ScanWindowValidationError("Enter valid delivery and return times.");
  }

  const deliveryDateTime = `${input.deliveryDate}T${input.deliveryTime}:00+05:30`;
  const returnDateTime = `${input.returnDate}T${input.returnTime}:00+05:30`;
  if (new Date(returnDateTime).getTime() <= new Date(deliveryDateTime).getTime()) {
    throw new ScanWindowValidationError("Return date/time must be after delivery date/time.");
  }
  return { ...input, deliveryDateTime, returnDateTime };
}

/** Client-side scanner normalization mirrors the server's string-safe rules. */
export function normalizeSessionScanCode(raw: string): string {
  return raw
    .replace(/[\r\n\u2028\u2029]+/g, "")
    .trim()
    .normalize("NFKC")
    .toUpperCase();
}

/**
 * Synchronous duplicate-decode gate. React state updates are asynchronous, so
 * scanner callbacks must claim a code here before starting any request.
 */
export function createScanDedupeGate(lockMs = SCAN_DUPLICATE_LOCK_MS) {
  const seen = new Set<string>();
  let lastDecode: { code: string; at: number } | null = null;

  return {
    claim(rawCode: string, now = Date.now(), force = false) {
      const code = normalizeSessionScanCode(rawCode);
      if (!code) return { accepted: false as const, reason: "empty" as const, code };
      if (
        !force &&
        lastDecode?.code === code &&
        now - lastDecode.at < lockMs
      ) {
        return { accepted: false as const, reason: "callback-lock" as const, code };
      }
      lastDecode = { code, at: now };
      if (!force && seen.has(code)) {
        return { accepted: false as const, reason: "already-scanned" as const, code };
      }
      seen.add(code);
      return { accepted: true as const, code };
    },
    forget(rawCode: string) {
      seen.delete(normalizeSessionScanCode(rawCode));
    },
    clear() {
      seen.clear();
      lastDecode = null;
    },
  };
}

export function isCurrentScanGeneration(
  requestGeneration: number,
  currentGeneration: number,
): boolean {
  return requestGeneration === currentGeneration;
}
