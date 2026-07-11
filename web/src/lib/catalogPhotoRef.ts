/**
 * Canonical photo reference helpers for the three-pipeline photo architecture.
 *
 * Pipeline 1: originalPhoto — immutable upload, legal reference
 * Pipeline 2: enhancedPhoto — strict-preservation AI enhancement (PAUSED — see enhancementFeatureFlags)
 * Pipeline 3: marketingPhoto — creative AI, never customer-facing
 *
 * Display rules (while Pipeline 2 is paused):
 *   Customer-facing (booking, slips, PDFs):  originalPhoto || photo
 *   Dress-checker embeddings:                originalPhoto || photo
 *   Recognition/AI indexing:                 recognitionImage || originalPhoto || photo
 *   Marketing page:                          marketingPhoto (stored separately)
 *
 * When AUTO_IMAGE_ENHANCEMENT_ENABLED is turned back on, customer-facing
 * surfaces again prefer enhancedPhoto when present.
 */
import { isAutoImageEnhancementEnabled } from "@/lib/ai/enhancementFeatureFlags";

/** @deprecated Variants removed — all surfaces use the single catalog photo. */
export type CatalogPhotoVariant =
  | "showcase"
  | "thumbnail"
  | "booking_slip"
  | "quotation"
  | "whatsapp"
  | "catalogue"
  | "mobile";

export type CatalogPhotoItem = Partial<{
  photo: string | null | undefined;
  originalPhoto: string | null | undefined;
  recognitionImage: string | null | undefined;
  enhancedPhoto: string | null | undefined;
  marketingPhoto: string | null | undefined;
}>;

export type NullableCatalogPhotoItem = CatalogPhotoItem | null | undefined;

/**
 * The single authoritative customer-facing photo.
 * While enhancement is paused: photo (latest upload) → originalPhoto
 * When enhancement is enabled: enhancedPhoto → photo → originalPhoto
 *
 * Prefer `photo` over `originalPhoto` so a re-upload always wins over a
 * stale original_photo backfill (avoids "same dress, different picture").
 *
 * Used by: inventory list, inventory search results, booking forms, slips, PDFs.
 */
export function inventoryPhotoRef(item: NullableCatalogPhotoItem): string {
  if (!item) return "";
  if (isAutoImageEnhancementEnabled() && item.enhancedPhoto) {
    return item.enhancedPhoto;
  }
  return item.photo || item.originalPhoto || "";
}

/**
 * Alias for inventoryPhotoRef — all customer-facing surfaces use this.
 */
export function catalogPhotoRef(
  item: NullableCatalogPhotoItem,
  _variant?: CatalogPhotoVariant,
): string {
  return inventoryPhotoRef(item);
}

/**
 * Uploaded inventory photo (enhancement paused — this is what the UI shows).
 * Prefer latest `photo` so list/detail/search never show a stale original_photo.
 */
export function originalPhotoRef(item: NullableCatalogPhotoItem): string {
  if (!item) return "";
  return item.photo || item.originalPhoto || "";
}

/**
 * Booking-slip outfit photos — same as catalogPhotoRef.
 */
export function slipOutfitPhotoRef(item: NullableCatalogPhotoItem): string {
  return inventoryPhotoRef(item);
}

/**
 * AI recognition indexing — prefers the dedicated recognition-preprocessed image,
 * then falls back to originalPhoto (NOT enhancedPhoto, to keep embedding stable).
 */
export function recognitionPhotoRef(item: NullableCatalogPhotoItem): string {
  if (!item) return "";
  // While enhancement is paused, do not prefer a stale recognitionImage that
  // may have been built from an older/different photo of the same design.
  if (!isAutoImageEnhancementEnabled()) {
    return item.photo || item.originalPhoto || "";
  }
  return item.recognitionImage || item.photo || item.originalPhoto || "";
}

/**
 * Dress-checker / embedding source.
 * While enhancement is paused: originalPhoto → photo (never marketingPhoto).
 * When enhancement is enabled: enhancedPhoto → originalPhoto → photo.
 */
export function embeddingSourcePhotoRef(item: NullableCatalogPhotoItem): string {
  if (!item) return "";
  if (isAutoImageEnhancementEnabled() && item.enhancedPhoto) {
    return item.enhancedPhoto;
  }
  return item.photo || item.originalPhoto || "";
}
