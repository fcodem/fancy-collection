export function photoUrl(photo?: string | null): string {
  if (!photo) return "";
  if (photo.startsWith("http") || photo.startsWith("data:")) return photo;
  if (photo.startsWith("/")) return photo;
  if (photo.startsWith("uploads/")) return `/${photo}`;
  return `/uploads/${photo}`;
}

/** Authenticated proxy URL for identity documents (never use raw Blob URLs in the browser). */
export function idProofUrl(stored?: string | null): string {
  if (!stored) return "";
  return `/api/uploads/id-proof?url=${encodeURIComponent(stored)}`;
}

