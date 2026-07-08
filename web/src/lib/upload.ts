import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { ALLOWED_EXTENSIONS } from "./constants";

export { photoUrl } from "./photoUrl";

const MAX_IMAGE_EDGE = 1920;
const JPEG_QUALITY = 82;
const ORIGINAL_JPEG_QUALITY = 95;

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "jpg";
}

async function storeBuffer(bytes: Buffer, relativePath: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${relativePath}`, bytes, { access: "public" });
    return blob.url;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required in production for photo uploads. " +
      "Add it in your Vercel environment variables."
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

export async function saveCompressedFromBuffer(raw: Buffer): Promise<string> {
  const bytes = await compressImageBuffer(raw);
  const path = `${randomUUID().replace(/-/g, "")}.jpg`;
  return storeBuffer(bytes, path);
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
 * Save the single inventory photo — preserved original only (one file, one DB field).
 */
export async function saveFastInventoryPhoto(file: File): Promise<string> {
  return saveOriginalUpload(file);
}

/** Resize, strip metadata, and JPEG-compress before storage. */
export async function compressImageBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

export async function saveUpload(file: File): Promise<string> {
  const ext = extFromName(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");
  const raw = Buffer.from(await file.arrayBuffer());
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
  const raw = Buffer.from(await file.arrayBuffer());
  const bytes = await compressImageBuffer(raw);
  const filename = `id-proofs/${randomUUID().replace(/-/g, "")}.jpg`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${filename}`, bytes, { access: "public" });
    return blob.url;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production.");
  }
  const dir = join(process.cwd(), "public", "uploads", "id-proofs");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
  return filename;
}
