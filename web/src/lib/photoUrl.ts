export function photoUrl(photo?: string | null): string {
  if (!photo) return "";
  if (photo.startsWith("http") || photo.startsWith("data:")) return photo;
  if (photo.startsWith("/")) return photo;
  if (photo.startsWith("uploads/")) return `/${photo}`;
  return `/uploads/${photo}`;
}

function isDurableMediaUrl(stored: string): boolean {
  return (
    stored.startsWith("http://") ||
    stored.startsWith("https://") ||
    stored.startsWith("data:")
  );
}

/**
 * List / free-item thumbnails: prefer HTTPS Blob URLs.
 * Relative `/uploads/...` thumbs often 404 on Vercel while the catalog photo still works.
 */
export function pickInventoryThumbRef(
  thumbnailPhoto?: string | null,
  photo?: string | null,
): string | null {
  const thumb = thumbnailPhoto?.trim() || "";
  const full = photo?.trim() || "";
  if (thumb && isDurableMediaUrl(thumb)) return thumb;
  if (full && isDurableMediaUrl(full)) return full;
  // Prefer full catalog over a relative thumb (more likely to resolve).
  return full || thumb || null;
}

/** Full / zoom photo: catalog first, then thumb. */
export function pickInventoryFullRef(
  photo?: string | null,
  thumbnailPhoto?: string | null,
): string | null {
  const full = photo?.trim() || "";
  const thumb = thumbnailPhoto?.trim() || "";
  return full || thumb || null;
}

/** Authenticated proxy URL for private booking media (never use raw Blob URLs in the browser). */
export function privateMediaUrl(stored?: string | null): string {
  if (!stored) return "";
  return `/api/uploads/private-media?url=${encodeURIComponent(stored)}`;
}

function looksPrivateBookingMedia(stored: string): boolean {
  return (
    /uploads\/private\//i.test(stored) ||
    /(?:^|\/)(id-proofs|orders|incomplete-returns|jewellery-selections|delivery-evidence|return-evidence|damage-evidence|fittings|measurements|whatsapp-inbox)\//i.test(
      stored,
    ) ||
    /\.private\.blob\./i.test(stored)
  );
}

/** Order/jewellery photos may be private uploads or public inventory catalogue refs. */
export function bookingPhotoUrl(stored?: string | null): string {
  if (!stored) return "";
  if (looksPrivateBookingMedia(stored)) return privateMediaUrl(stored);
  return photoUrl(stored);
}

/** @deprecated Use privateMediaUrl — kept for backward compatibility. */
export function idProofUrl(stored?: string | null): string {
  if (!stored) return "";
  return `/api/uploads/id-proof?url=${encodeURIComponent(stored)}`;
}
