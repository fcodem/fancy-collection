import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { ALLOWED_EXTENSIONS } from "./constants";

export { photoUrl } from "./photoUrl";

const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 72;
const ORIGINAL_JPEG_QUALITY = 78;

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "jpg";
}

async function storeBuffer(
  bytes: Buffer,
  relativePath: string,
  opts?: { access?: "public" | "private" },
): Promise<string> {
  const access = opts?.access ?? "public";
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    try {
      const blob = await put(`uploads/${relativePath}`, bytes, {
        access,
        token,
        multipart: bytes.length > 4 * 1024 * 1024,
      });
      return blob.url;
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Blob upload failed";
      throw new Error(`Photo upload to Vercel Blob failed: ${detail}`);
    }
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "Cannot save photo: BLOB_READ_WRITE_TOKEN is missing from this deployment. " +
        "Vercel → Settings → Environment Variables → add BLOB_READ_WRITE_TOKEN for Production → Redeploy.",
    );
  }
  const dir = join(process.cwd(), "public", "uploads", relativePath.split("/").slice(0, -1).join("/"));
  await mkdir(dir, { recursive: true });
  const filename = relativePath.split("/").pop()!;
  await writeFile(join(process.cwd(), "public", "uploads", relativePath), bytes);
  return relativePath.includes("/") ? relativePath : filename;
}

async function encodeOriginalBuffer(raw: Buffer, filename: string): Promise<{ bytes: Buffer; outExt: string }> {
  const ext = extFromName(filename);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");

  if (ext === "png") {
    return {
      bytes: await sharp(raw).rotate().png({ compressionLevel: 6 }).toBuffer(),
      outExt: "png",
    };
  }
  if (ext === "webp") {
    return {
      bytes: await sharp(raw).rotate().webp({ quality: 95 }).toBuffer(),
      outExt: "webp",
    };
  }
  return {
    bytes: await sharp(raw).rotate().jpeg({ quality: ORIGINAL_JPEG_QUALITY, mozjpeg: true }).toBuffer(),
    outExt: "jpg",
  };
}

async function saveOriginalFromBuffer(raw: Buffer, filename: string): Promise<string> {
  const { bytes, outExt } = await encodeOriginalBuffer(raw, filename);
  const path = `originals/${randomUUID().replace(/-/g, "")}.${outExt}`;
  return storeBuffer(bytes, path);
}

export async function saveCompressedFromBuffer(
  raw: Buffer,
  subfolder = "",
  opts?: { access?: "public" | "private" },
): Promise<string> {
  const bytes = await compressImageBuffer(raw);
  const filename = `${randomUUID().replace(/-/g, "")}.jpg`;
  const path = subfolder ? `${subfolder.replace(/\/$/, "")}/${filename}` : filename;
  return storeBuffer(bytes, path, opts);
}

/** Preserve original upload — EXIF rotate only, no resize or heavy compression. */
export async function saveOriginalUpload(file: File): Promise<string> {
  const raw = Buffer.from(await file.arrayBuffer());
  return saveOriginalFromBuffer(raw, file.name);
}

/** Store a recognition-preprocessed image (never shown to customers). */
export async function saveRecognitionBuffer(bytes: Buffer, itemId: number): Promise<string> {
  const filename = `recognition/${itemId}-rec.jpg`;
  return storeBuffer(bytes, filename);
}

/**
 * Save inventory photo.
 * On Vercel: never run sharp (OOM kills the serverless function) — store bytes directly to Blob.
 * Locally: compress with sharp when possible, else raw.
 */
export async function saveFastInventoryPhoto(file: File): Promise<string> {
  const { photo } = await saveFastInventoryPhotoWithThumb(file);
  return photo;
}

/** List thumbnail (~320px WebP). Best-effort — returns null if sharp fails (e.g. Vercel OOM). */
export async function saveInventoryThumbnailFromBuffer(raw: Buffer): Promise<string | null> {
  if (!raw.length) return null;
  try {
    const bytes = await sharp(raw, { failOn: "none", limitInputPixels: 40_000_000 })
      .rotate()
      .resize(320, 320, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    const path = `thumbs/${randomUUID().replace(/-/g, "")}.webp`;
    return await storeBuffer(bytes, path);
  } catch (e) {
    console.error(
      "[upload] thumbnail generation skipped:",
      e instanceof Error ? e.message.slice(0, 120) : "error",
    );
    return null;
  }
}

/**
 * Store catalog photo and optionally a list thumbnail.
 * Thumbnail failure never fails the inventory save.
 */
export async function saveFastInventoryPhotoWithThumb(
  file: File,
): Promise<{ photo: string; thumbnailPhoto: string | null }> {
  const raw = Buffer.from(await file.arrayBuffer());
  if (!raw.length) throw new Error("Empty photo file.");

  const ext = extFromName(file.name);
  const outExt = ALLOWED_EXTENSIONS.includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
  if (!ALLOWED_EXTENSIONS.includes(ext) && !String(file.type || "").startsWith("image/")) {
    throw new Error("Invalid file type. Use JPG, PNG, or WEBP.");
  }

  let photo: string;
  if (process.env.VERCEL) {
    const path = `${randomUUID().replace(/-/g, "")}.jpg`;
    photo = await storeBuffer(raw, path);
  } else {
    try {
      photo = await saveCompressedFromBuffer(raw);
    } catch (e) {
      console.error(
        "[upload] compress failed, uploading raw bytes:",
        e instanceof Error ? e.message : e,
      );
      const path = `${randomUUID().replace(/-/g, "")}.${outExt}`;
      photo = await storeBuffer(raw, path);
    }
  }

  const thumbnailPhoto = await saveInventoryThumbnailFromBuffer(raw);
  return { photo, thumbnailPhoto };
}

/** Resize, strip metadata, and JPEG-compress before storage. */
export async function compressImageBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none", limitInputPixels: 40_000_000 })
    .rotate()
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: false })
    .toBuffer();
}

export async function saveUpload(file: File): Promise<string> {
  const ext = extFromName(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB.");
  }
  const raw = Buffer.from(await file.arrayBuffer());
  // Validate bytes are a real image and reject absurd dimensions.
  const meta = await sharp(raw, { failOn: "none", limitInputPixels: 40_000_000 }).metadata();
  if (!meta.format || !["jpeg", "jpg", "png", "webp"].includes(meta.format)) {
    throw new Error("File content is not a supported image.");
  }
  if ((meta.width || 0) > 8000 || (meta.height || 0) > 8000) {
    throw new Error("Image dimensions are too large.");
  }
  return saveCompressedFromBuffer(raw);
}

/** Remove a stored upload (local filename or Vercel Blob URL). */
export async function deleteUpload(stored: string | null | undefined): Promise<void> {
  if (!stored?.trim()) return;

  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        await del(stored);
      } catch {
        /* file may already be gone */
      }
    }
    return;
  }

  const filename = stored.replace(/^uploads\//, "").replace(/^\//, "");
  try {
    await unlink(join(process.cwd(), "public", "uploads", filename));
  } catch {
    /* file may already be gone */
  }
}

export async function deleteUploads(stored: Array<string | null | undefined>): Promise<void> {
  await Promise.all(stored.map((s) => deleteUpload(s)));
}

export async function saveIdProofUpload(file: File): Promise<string> {
  const ext = extFromName(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("ID proof must be under 5 MB.");
  }
  const raw = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(raw, { failOn: "none", limitInputPixels: 40_000_000 }).metadata();
  if (!meta.format || !["jpeg", "jpg", "png", "webp"].includes(meta.format)) {
    throw new Error("ID proof must be a valid image file.");
  }
  if ((meta.width || 0) > 8000 || (meta.height || 0) > 8000) {
    throw new Error("ID proof image dimensions are too large.");
  }
  // Private Blob (or local path). Never use public catalogue storage for ID documents.
  return saveCompressedFromBuffer(raw, "id-proofs", { access: "private" });
}
