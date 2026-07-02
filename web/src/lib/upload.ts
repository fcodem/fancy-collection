import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { put, del } from "@vercel/blob";
import sharp from "sharp";
import { ALLOWED_EXTENSIONS } from "./constants";

export { photoUrl } from "./photoUrl";

const MAX_IMAGE_EDGE = 1920;
const JPEG_QUALITY = 82;

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "jpg";
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
  const bytes = await compressImageBuffer(raw);
  const filename = `${randomUUID().replace(/-/g, "")}.jpg`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${filename}`, bytes, { access: "public" });
    return blob.url;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required in production for photo uploads. " +
      "Add it in your Vercel environment variables."
    );
  }

  // Local development only — save to public/uploads/
  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), bytes);
  return filename;
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
