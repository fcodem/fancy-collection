/**
 * Client-side image compression for incomplete-return / ID photos.
 * Corrects orientation via browser decode; caps long edge; JPEG quality ~0.82.
 */

export type CompressImageOptions = {
  maxEdge?: number;
  quality?: number;
  mimeType?: string;
};

export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {},
): Promise<File> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.82;
  const mimeType = opts.mimeType ?? "image/jpeg";

  if (!file.type.startsWith("image/")) return file;
  if (file.size < 180_000) return file; // already small

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), mimeType, quality),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: mimeType, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

/** Alias for inventory / catalog uploads (same pipeline as compressImageFile). */
export async function compressImageForUpload(file: File): Promise<File> {
  return compressImageFile(file, { maxEdge: 1280, quality: 0.72 });
}

/** Upload with concurrency limit (default 2). */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}