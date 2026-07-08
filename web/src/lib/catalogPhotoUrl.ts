import { photoUrl } from "./photoUrl";
import {
  catalogPhotoRef,
  recognitionPhotoRef,
  type CatalogPhotoItem,
  type CatalogPhotoVariant,
  type NullableCatalogPhotoItem,
} from "./catalogPhotoRef";

export {
  catalogPhotoRef,
  recognitionPhotoRef,
  type CatalogPhotoItem,
  type CatalogPhotoVariant,
  type NullableCatalogPhotoItem,
};

export function catalogPhotoUrl(
  item: NullableCatalogPhotoItem,
  variant: CatalogPhotoVariant = "showcase",
): string {
  const ref = catalogPhotoRef(item, variant);
  return ref ? photoUrl(ref) : "";
}

export function recognitionPhotoUrl(item: NullableCatalogPhotoItem): string {
  const ref = recognitionPhotoRef(item);
  return ref ? photoUrl(ref) : "";
}
