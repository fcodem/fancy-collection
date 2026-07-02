import {
  triggerWhatsAppSlipJobs,
  type SlipJobTriggerOptions,
} from "./slipScheduling";
import { isWhatsAppReceiptsDisabled } from "./metaApi";

export const SLIP_DEBOUNCE_MS = 45_000;

type SlipKind = "delivery" | "return";

type DebounceEntry = {
  timer: ReturnType<typeof setTimeout>;
  opts: SlipJobTriggerOptions;
};

const debounceMap = new Map<string, DebounceEntry>();

function debounceKey(bookingId: number, kind: SlipKind): string {
  return `${kind}:${bookingId}`;
}

function cancelDebounce(bookingId: number, kind: SlipKind): SlipJobTriggerOptions | undefined {
  const key = debounceKey(bookingId, kind);
  const existing = debounceMap.get(key);
  if (!existing) return undefined;
  clearTimeout(existing.timer);
  debounceMap.delete(key);
  return existing.opts;
}

/** Reset idle timer; flush sends all unnotified items after SLIP_DEBOUNCE_MS. */
export function scheduleDebouncedSlipTrigger(
  bookingId: number,
  kind: SlipKind,
  opts: SlipJobTriggerOptions,
): void {
  if (isWhatsAppReceiptsDisabled()) return;

  const key = debounceKey(bookingId, kind);
  const existing = debounceMap.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    debounceMap.delete(key);
    void flushDebouncedSlipTrigger(bookingId, kind);
  }, SLIP_DEBOUNCE_MS);

  debounceMap.set(key, { timer, opts });
}

/** Clear pending timer and send slips for all unnotified delta items. */
export async function flushDebouncedSlipTrigger(
  bookingId: number,
  kind: SlipKind,
): Promise<void> {
  const opts = cancelDebounce(bookingId, kind);
  if (!opts) return;

  await triggerWhatsAppSlipJobs(bookingId, kind, {
    requestOrigin: opts.requestOrigin,
    createdBy: opts.createdBy,
  });
}

/** Cancel any pending debounce and send immediately (omit item IDs → full delta). */
export async function finalizeSlipTrigger(
  bookingId: number,
  kind: SlipKind,
  opts?: SlipJobTriggerOptions,
): Promise<void> {
  if (isWhatsAppReceiptsDisabled()) return;

  cancelDebounce(bookingId, kind);

  const triggerOpts: SlipJobTriggerOptions = {};
  if (opts?.requestOrigin) triggerOpts.requestOrigin = opts.requestOrigin;
  if (opts?.createdBy) triggerOpts.createdBy = opts.createdBy;
  if (opts?.deliveryItemIds?.length) {
    triggerOpts.deliveryItemIds = opts.deliveryItemIds;
  }
  if (opts?.returnItemIds?.length) triggerOpts.returnItemIds = opts.returnItemIds;
  if (opts?.incompleteItemIds?.length) {
    triggerOpts.incompleteItemIds = opts.incompleteItemIds;
  }

  await triggerWhatsAppSlipJobs(bookingId, kind, triggerOpts);
}
