/** Normalize FormData upload values — Next/undici sometimes yields Blob, not File. */
export function formDataToFile(
  value: FormDataEntryValue | null | undefined,
  fallbackName = "upload.jpg",
): File | null {
  if (value == null || typeof value === "string") return null;
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    if (value.size <= 0) return null;
    if (typeof File !== "undefined" && value instanceof File) return value;
    const name =
      "name" in value && typeof (value as File).name === "string" && (value as File).name
        ? (value as File).name
        : fallbackName;
    return new File([value], name, { type: value.type || "image/jpeg" });
  }
  return null;
}
