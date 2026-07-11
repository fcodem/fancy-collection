import { setImmediate } from "timers";
import { broadcastShopEvent } from "../realtime/broadcast";
import {
  generateInventoryAiProfile,
  logProfileEvent,
  resetInventoryAiProfile,
  type ProfileGenerateMode,
} from "./generateProfile";
import { AI_PROFILE_MAX_RETRIES } from "./constants";

const pending = new Set<number>();
const retryCount = new Map<number, number>();

export function getAiQueueSnapshot() {
  return {
    pending: pending.size,
    pendingItemIds: [...pending.values()].slice(0, 100),
    retries: [...retryCount.entries()].map(([itemId, attempts]) => ({ itemId, attempts })),
  };
}

/** Queue AI profile generation — returns immediately, never blocks inventory save. */
export function scheduleInventoryAiProfile(
  itemId: number,
  mode: ProfileGenerateMode = "full",
  reason = "photo_pipeline",
): void {
  if (!itemId || pending.has(itemId)) return;
  pending.add(itemId);

  setImmediate(() => {
    void (async () => {
      try {
        console.log(`[ai-profile] item=${itemId} queued mode=${mode} reason=${reason}`);
        await logProfileEvent(itemId, "queued", reason);
        await generateInventoryAiProfile(itemId, mode, reason);
        broadcastShopEvent({ type: "inventory.changed", itemIds: [itemId] });
      } catch (err) {
        console.error("[ai-profile]", itemId, err);
        const attempts = (retryCount.get(itemId) || 0) + 1;
        retryCount.set(itemId, attempts);
        try {
          await logProfileEvent(itemId, "retry_scheduled", `attempt ${attempts}`, { retryCount: attempts });
        } catch {
          // profile row may not exist yet
        }
        if (attempts < AI_PROFILE_MAX_RETRIES) {
          setTimeout(
            () => scheduleInventoryAiProfile(itemId, mode, `retry_${attempts}`),
            5000 * attempts,
          );
        }
      } finally {
        pending.delete(itemId);
      }
    })();
  });
}

export function onInventoryAiProfilePhotoRemoved(itemId: number): void {
  void resetInventoryAiProfile(itemId);
}
