import { photoUrl } from "./photoUrl";
import {
  catalogPhotoRef,
  originalPhotoRef,
  recognitionPhotoRef,
  embeddingSourcePhotoRef,
  type CatalogPhotoItem,
  type CatalogPhotoVariant,
  type NullableCatalogPhotoItem,
} from "./catalogPhotoRef";

export {
  catalogPhotoRef,
  originalPhotoRef,
  recognitionPhotoRef,
  embeddingSourcePhotoRef,
  type CatalogPhotoItem,
  type CatalogPhotoVariant,
  type NullableCatalogPhotoItem,
};

/** Customer-facing catalog URL: enhancedPhoto → originalPhoto → photo */
export function catalogPhotoUrl(
  item: NullableCatalogPhotoItem,
  variant: CatalogPhotoVariant = "showcase",
): string {
  const ref = catalogPhotoRef(item, variant);
  return ref ? photoUrl(ref) : "";
}

/** Raw upload URL (immutable original). */
export function originalPhotoUrl(item: NullableCatalogPhotoItem): string {
  const ref = originalPhotoRef(item);
  return ref ? photoUrl(ref) : "";
}

/** AI/recognition image URL. */
export function recognitionPhotoUrl(item: NullableCatalogPhotoItem): string {
  const ref = recognitionPhotoRef(item);
  return ref ? photoUrl(ref) : "";
}

/** Embedding source URL (enhanced → original → photo, never marketing). */
export function embeddingSourcePhotoUrl(item: NullableCatalogPhotoItem): string {
  const ref = embeddingSourcePhotoRef(item);
  return ref ? photoUrl(ref) : "";
}
