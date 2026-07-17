import { createHash } from "crypto";

/** Stable JSON stringify with sorted object keys (arrays keep order). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function hashRequestPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function assertSamePayloadOrThrow(existingHash: string, newPayload: unknown): void {
  const next = hashRequestPayload(newPayload);
  if (existingHash !== next) {
    throw new Error("operation_id was already used with a different payload");
  }
}

export function buildWhatsAppIdempotencyKey(
  jobType: string,
  bookingId: number,
  itemIds: number[] = [],
  version = "v1",
): string {
  const items = [...itemIds].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  return `${jobType}:${bookingId}:${items.join(",") || "none"}:${version}`;
}
