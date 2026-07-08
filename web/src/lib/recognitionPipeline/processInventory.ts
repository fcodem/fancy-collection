/**
 * Backward-compatible re-exports — dress checker v3 engine lives in dressChecker/.
 */
export {
  processInventoryAiProfile as processInventoryFingerprint,
  rebuildAllAiProfiles as rebuildAllFingerprints,
  rebuildSelectedAiProfiles as rebuildSelectedFingerprints,
  scheduleInventoryAiProfile as scheduleInventoryFingerprint,
} from "../dressChecker/processInventory";
