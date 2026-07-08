/** @deprecated Variants removed — all surfaces use the single uploaded photo. */
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
  recognitionImage: string | null | undefined;
}>;

export type NullableCatalogPhotoItem = CatalogPhotoItem | null | undefined;

/** Single authoritative customer-facing inventory image. */
export function inventoryPhotoRef(item: NullableCatalogPhotoItem): string {
  if (!item) return "";
  return item.photo || "";
}

/** Customer-facing display — always the uploaded photo. */
export function catalogPhotoRef(
  item: NullableCatalogPhotoItem,
  _variant?: CatalogPhotoVariant,
): string {
  return inventoryPhotoRef(item);
}

/** Booking-slip outfit pages — same uploaded photo. */
export function slipOutfitPhotoRef(item: NullableCatalogPhotoItem): string {
  return inventoryPhotoRef(item);
}

/**
 * AI recognition — prefers dedicated recognition image (preprocessed for matching),
 * then the uploaded photo. Never returns customer-facing generated variants.
 */
export function recognitionPhotoRef(item: NullableCatalogPhotoItem): string {
  if (!item) return "";
  return item.recognitionImage || item.photo || "";
}
