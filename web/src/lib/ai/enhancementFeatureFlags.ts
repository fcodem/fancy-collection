/**
 * Dress image enhancement (Pipeline 2) feature flags.
 *
 * The full enhancement implementation remains in:
 *   - lib/ai/enhancementPipeline.ts
 *   - lib/ai/enhancementPrompts.ts
 *   - lib/ai/openaiVision.ts (enhanceInventoryImage)
 *   - lib/ai/enhancementStorage.ts
 *   - /ai-tools/image-enhancer (manual tool)
 *
 * CURRENT POLICY (paused + UI hidden):
 *   - On inventory upload: save the uploaded image only (photo + originalPhoto)
 *   - Still collect AI metadata / recognition / embeddings from the uploaded image
 *   - Do NOT call OpenAI image enhancement automatically
 *   - Inventory detail shows original photo only (no Enhanced / Marketing tabs)
 *   - AI Enhancer / Catalog Generator nav links are hidden (pages kept for later)
 *
 * To re-enable automatic enhancement later, set AUTO_IMAGE_ENHANCEMENT_ENABLED = true
 * and restore the nav links + InventoryPhotoTabs on inventory detail.
 */

/** When false, Pipeline 2 auto-enhancement is skipped everywhere. Code is kept for future use. */
export const AUTO_IMAGE_ENHANCEMENT_ENABLED = false;

export function isAutoImageEnhancementEnabled(): boolean {
  // Optional env override for local experiments without code edits:
  // AI_AUTO_IMAGE_ENHANCEMENT=1
  if (process.env.AI_AUTO_IMAGE_ENHANCEMENT === "1") return true;
  if (process.env.AI_AUTO_IMAGE_ENHANCEMENT === "0") return false;
  return AUTO_IMAGE_ENHANCEMENT_ENABLED;
}
