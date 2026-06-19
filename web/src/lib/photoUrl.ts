export function photoUrl(photo?: string | null): string {
  if (!photo) return "";
  if (photo.startsWith("http") || photo.startsWith("data:")) return photo;
  if (photo.startsWith("/")) return photo;
  if (photo.startsWith("uploads/")) return `/${photo}`;
  return `/uploads/${photo}`;
}
