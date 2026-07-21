export function photoUrl(photo?: string | null): string {
  if (!photo) return "";
  if (photo.startsWith("http") || photo.startsWith("data:")) return photo;
  if (photo.startsWith("/")) return photo;
  if (photo.startsWith("uploads/")) return `/${photo}`;
  return `/uploads/${photo}`;
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
