import { join } from "path";
import { existsSync, statSync } from "fs";

/** Human-readable byte size for inventory detail UI. */
export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Best-effort size of a stored inventory media path (Vercel Blob URL or local uploads/).
 * Returns null when size cannot be determined quickly.
 */
export async function measureStoredMediaBytes(
  stored?: string | null,
): Promise<number | null> {
  const ref = (stored || "").trim();
  if (!ref) return null;

  try {
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4_000);
      try {
        const res = await fetch(ref, {
          method: "HEAD",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return null;
        const header = res.headers.get("content-length");
        const n = header ? Number(header) : NaN;
        return Number.isFinite(n) && n >= 0 ? n : null;
      } finally {
        clearTimeout(timer);
      }
    }

    const relative = ref.replace(/^\/+/, "").replace(/^uploads\//, "uploads/");
    const absolute = join(process.cwd(), "public", relative.startsWith("uploads/") ? relative : join("uploads", relative));
    if (!existsSync(absolute)) return null;
    return statSync(absolute).size;
  } catch {
    return null;
  }
}

/** Sum of main photo + thumbnail storage for one inventory record. */
export async function measureInventoryRecordBytes(paths: {
  photo?: string | null;
  thumbnailPhoto?: string | null;
  originalPhoto?: string | null;
}): Promise<number | null> {
  const refs = [
    paths.photo,
    paths.thumbnailPhoto && paths.thumbnailPhoto !== paths.photo ? paths.thumbnailPhoto : null,
    paths.originalPhoto &&
    paths.originalPhoto !== paths.photo &&
    paths.originalPhoto !== paths.thumbnailPhoto
      ? paths.originalPhoto
      : null,
  ].filter(Boolean) as string[];

  if (!refs.length) return null;

  const sizes = await Promise.all(refs.map((ref) => measureStoredMediaBytes(ref)));
  const known = sizes.filter((n): n is number => n != null);
  if (!known.length) return null;
  return known.reduce((sum, n) => sum + n, 0);
}
