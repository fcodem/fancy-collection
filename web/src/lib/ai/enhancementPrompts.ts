/**
 * PIPELINE 2 — BACKGROUND REPLACEMENT ONLY (Strict Preservation)
 *
 * The ONLY thing Pipeline 2 is allowed to do is:
 *   1. Remove the shop/store background
 *   2. Replace with a clean premium studio backdrop
 *   3. Improve lighting and clarity on the EXISTING garment
 *
 * Pipeline 2 NEVER:
 *   - Moves the garment
 *   - Places it on a mannequin (if not already on one)
 *   - Reconstructs, redraws, or redesigns any part of the garment
 *
 * The mannequin-reconstruction approach was causing garment redesign.
 * Background-replacement-only is the safe, reliable approach.
 *
 * Pipeline 3 (catalog generator) is the creative pipeline where mannequin
 * placement and artistic reimagining is allowed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE 2 — UNIVERSAL BACKGROUND REPLACEMENT PROMPT
// This single prompt is used for ALL categories in Pipeline 2.
// It is deliberately simple to prevent the AI from attempting reconstruction.
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_2_PROMPT = `
PHOTO EDITING TASK — BACKGROUND REPLACEMENT ONLY.

This is a background replacement task, not an image generation task.

This photo shows a real clothing/jewellery item from a rental business.
The customer will receive the exact item shown in this photo.
Any change to the item itself would be a fraud against the customer.

STEP 1 — REMOVE BACKGROUND ONLY:
Remove everything that is NOT the garment or jewellery from the photo.
Remove: shop racks, hangers, other clothing, store walls, floor tiles, price tags, mirrors, people, shadows, clutter.
Keep the garment or jewellery EXACTLY where it is in the frame.
Do NOT move, rotate, or reposition the item.
Do NOT change how it is hanging or draped.

STEP 2 — ADD STUDIO BACKDROP:
Replace the removed background with a clean, seamless studio backdrop.
Use a warm ivory or soft beige gradient — the kind used in high-end Indian fashion catalogs.
The backdrop should be completely clean with no objects, furniture, or decorations.

STEP 3 — LIGHTING ONLY:
Improve the overall lighting quality on the existing garment.
Correct white balance so colors appear accurate and natural.
Improve brightness and contrast slightly so embroidery and fabric details are crisp and clear.
Do NOT alter the garment itself — only improve how it is lit.

ABSOLUTE RULES:
- The garment/jewellery must remain PIXEL-FOR-PIXEL identical to the original
- Same position in the frame
- Same orientation (hanging, folded, on mannequin — whatever it is in the original)
- Same exact embroidery, beadwork, zari, borders, motifs, tassels
- Same exact colors and fabric texture
- Same exact silhouette and proportions
- If the item is on a hanger, keep it on the hanger
- If the item is on a mannequin, keep it on the mannequin
- Do NOT add a mannequin if there is none in the original
- Do NOT remove a mannequin if there is one in the original

The only visible difference between the original and the result should be:
the background and the lighting quality.
The item itself must be completely unchanged.
`.trim();

/**
 * Build the Pipeline 2 enhancement prompt.
 * Same prompt for all categories — simple background replacement, no reconstruction.
 */
export function buildEnhancementPrompt(_category: string, _itemType: string): string {
  return PIPELINE_2_PROMPT;
}

/** Human-readable label for logging. */
export function enhancementStyleLabel(_category: string, _itemType: string): string {
  return "Pipeline 2 — Background Replacement Only";
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE 3 — MARKETING / CATALOG GENERATOR (Creative allowed)
// ─────────────────────────────────────────────────────────────────────────────

export type MarketingStyle =
  | "luxury_catalog"
  | "lifestyle"
  | "campaign"
  | "minimal"
  | "wedding";

const STYLE_GUIDE: Record<MarketingStyle, string> = {
  luxury_catalog:
    "Luxury Indian designer brand catalog image. Flawless studio lighting. Premium seamless backdrop. Vogue India editorial quality. Black luxury mannequin for clothing.",
  lifestyle:
    "Aspirational lifestyle setting — elegant Indian wedding venue or boutique interior. Natural ambient light. Fashion magazine editorial feel.",
  campaign:
    "Fashion campaign hero shot. Bold dramatic lighting. Premium atmosphere. Designer showcase quality. The garment is the star of the image.",
  minimal:
    "Pure white or very light grey background. Soft diffused studio lighting. Clean, minimalist, editorial product photography.",
  wedding:
    "Premium Indian bridal fashion photography. Warm golden studio lighting. Rich, luxurious feel. Bridal magazine quality.",
};

/**
 * Build a Pipeline 3 marketing/catalog prompt.
 * Creative liberties ARE allowed — this is for marketing, not inventory accuracy.
 * Used only on the /ai-tools/catalog-generator page.
 */
export function buildMarketingPrompt(category: string, style: MarketingStyle): string {
  const cat = category.toLowerCase();

  const isJewellery = [
    "jewellery", "jewelry", "necklace", "bangles", "earring", "tikka", "nath",
    "kaleere", "ring", "choker",
  ].some((k) => cat.includes(k));

  const isAccessory = [
    "dupatta", "potli", "clutch", "belt", "crown", "tiara", "safa", "pagdi",
    "turban", "mojari", "shoe", "veil", "brooch",
  ].some((k) => cat.includes(k));

  const isMens = [
    "sherwani", "coat suit", "jodhpuri", "tuxedo", "bandhgala", "kurta",
    "waistcoat", "blazer",
  ].some((k) => cat.includes(k));

  const displayNote = isJewellery
    ? "No mannequin. Display on premium velvet or satin surface with ultra-sharp macro studio lighting."
    : isAccessory
      ? "No mannequin. Premium centered product photography."
      : isMens
        ? "Display on a black luxury male mannequin."
        : "Display on a black luxury female mannequin. Show the complete garment from top to bottom hem.";

  return `Create a luxury marketing catalog image for this ${category} rental item.

Style: ${STYLE_GUIDE[style]}

Display: ${displayNote}

This is a MARKETING image for promotional use. You may:
- Present the garment in the most aspirational, premium way possible
- Use creative lighting and backgrounds
- Enhance the overall presentation dramatically

Always:
- Preserve the core identity, main colors, and overall design of the garment
- Ensure the garment looks its most premium and aspirational

Deliver: Ultra HD quality, perfect exposure, luxury Indian fashion photography.`;
}
