import { join } from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { ALLOWED_EXTENSIONS } from "./constants";
import {
  deletePermanentInventoryImage,
  isPermanentInventoryMedia,
  savePermanentInventoryImage,
  PermanentInventoryMediaError,
  REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA,
} from "./storage/publicInventoryMedia";
import {
  deletePrivateBookingMedia,
  isPrivateBookingMedia,
  requirePrivateMediaToken,
  savePrivateBookingMedia,
  PrivateMediaError,
} from "./storage/privateBookingMedia";

export { photoUrl, idProofUrl, privateMediaUrl, bookingPhotoUrl } from "./photoUrl";
export {
  isPermanentInventoryMedia,
  REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA,
  PermanentInventoryMediaError,
} from "./storage/publicInventoryMedia";
export {
  isPrivateBookingMedia,
  requirePrivateMediaToken,
  APPROVED_PRIVATE_MEDIA_FOLDERS,
} from "./storage/privateBookingMedia";

const MAX_IMAGE_EDGE = 720;
const JPEG_QUALITY = 55;
const ORIGINAL_JPEG_QUALITY = 58;
const THUMBNAIL_EDGE = 180;
const THUMBNAIL_WEBP_QUALITY = 55;

function extFromName(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "jpg";
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
  const path = `${randomUUID().replace(/-/g, "")}.${outExt}`;
  return savePermanentInventoryImage(bytes, "dresses", path);
}

export async function saveCompressedFromBuffer(
  raw: Buffer,
  subfolder = "",
  opts?: { access?: "public" | "private" },
): Promise<string> {
  if (opts?.access === "private") {
    const bytes = await compressImageBuffer(raw);
    return savePrivateBookingMedia(bytes, "orders");
  }
  const bytes = await compressImageBuffer(raw);
  const filename = `${randomUUID().replace(/-/g, "")}.jpg`;
  const folder =
    subfolder === "marketing" || subfolder === "enhanced"
      ? "dresses"
      : subfolder === "thumbs" || subfolder === "thumbnails"
        ? "thumbnails"
        : "dresses";
  return savePermanentInventoryImage(bytes, folder, filename);
}

/** Preserve original upload — EXIF rotate only, no resize or heavy compression. */
export async function saveOriginalUpload(file: File): Promise<string> {
  const raw = Buffer.from(await file.arrayBuffer());
  return saveOriginalFromBuffer(raw, file.name);
}

/** Store a recognition-preprocessed image (never shown to customers). */
export async function saveRecognitionBuffer(bytes: Buffer, itemId: number): Promise<string> {
  const filename = `${itemId}-rec.jpg`;
  return savePermanentInventoryImage(bytes, "recognition", filename);
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
      .resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: THUMBNAIL_WEBP_QUALITY })
      .toBuffer();
    const filename = `${randomUUID().replace(/-/g, "")}.webp`;
    return await savePermanentInventoryImage(bytes, "thumbnails", filename);
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
    const filename = `${randomUUID().replace(/-/g, "")}.jpg`;
    photo = await savePermanentInventoryImage(raw, "dresses", filename);
  } else {
    try {
      photo = await saveCompressedFromBuffer(raw);
    } catch (e) {
      console.error(
        "[upload] compress failed, uploading raw bytes:",
        e instanceof Error ? e.message : e,
      );
      const filename = `${randomUUID().replace(/-/g, "")}.${outExt}`;
      photo = await savePermanentInventoryImage(raw, "dresses", filename);
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

/** @deprecated Prefer savePrivateBookingMedia for booking contexts. Public generic upload for admin/tools. */
export async function saveUpload(file: File): Promise<string> {
  const ext = extFromName(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB.");
  }
  const raw = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(raw, { failOn: "none", limitInputPixels: 40_000_000 }).metadata();
  if (!meta.format || !["jpeg", "jpg", "png", "webp"].includes(meta.format)) {
    throw new Error("File content is not a supported image.");
  }
  if ((meta.width || 0) > 8000 || (meta.height || 0) > 8000) {
    throw new Error("Image dimensions are too large.");
  }
  return saveCompressedFromBuffer(raw);
}

/** Save compressed private booking media (orders, incomplete returns, etc.). */
export async function savePrivateBookingUpload(
  file: File,
  folder: "orders" | "incomplete-returns" | "jewellery-selections",
): Promise<string> {
  const ext = extFromName(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("Invalid file type");
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB.");
  }
  const raw = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(raw, { failOn: "none", limitInputPixels: 40_000_000 }).metadata();
  if (!meta.format || !["jpeg", "jpg", "png", "webp"].includes(meta.format)) {
    throw new Error("File content is not a supported image.");
  }
  if ((meta.width || 0) > 8000 || (meta.height || 0) > 8000) {
    throw new Error("Image dimensions are too large.");
  }
  const bytes = await compressImageBuffer(raw);
  return savePrivateBookingMedia(bytes, folder);
}

/** Remove a stored upload (local filename or Vercel Blob URL). */
export async function deleteUpload(
  stored: string | null | undefined,
  opts?: { allowInventoryReplacement?: boolean },
): Promise<void> {
  if (!stored?.trim()) return;

  if (isPermanentInventoryMedia(stored) && !opts?.allowInventoryReplacement) {
    throw new PermanentInventoryMediaError(
      "Refusing to delete permanent inventory media without explicit inventory replacement.",
    );
  }

  if (isPrivateBookingMedia(stored)) {
    await deletePrivateBookingMedia(stored);
    return;
  }

  if (isPermanentInventoryMedia(stored)) {
    await deletePermanentInventoryImage(stored, opts);
    return;
  }

  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (token) {
      try {
        const { del } = await import("@vercel/blob");
        await del(stored, { token });
      } catch {
        /* file may already be gone */
      }
    }
    return;
  }

  const filename = stored.replace(/^uploads\//, "").replace(/^\//, "");
  try {
    const { unlink } = await import("fs/promises");
    await unlink(join(process.cwd(), "public", "uploads", filename));
  } catch {
    /* file may already be gone */
  }
}

export async function deleteUploads(
  stored: Array<string | null | undefined>,
  opts?: { allowInventoryReplacement?: boolean },
): Promise<void> {
  await Promise.all(stored.map((s) => deleteUpload(s, opts)));
}

export class IdProofUploadError extends PrivateMediaError {
  constructor(
    message: string,
    code: PrivateMediaError["code"],
    options?: { cause?: unknown },
  ) {
    super(message, code, options);
    this.name = "IdProofUploadError";
  }
}

export function requireIdProofBlobToken(): string {
  return requirePrivateMediaToken();
}

export function getBlobStorageConfig(): {
  publicBlobConfigured: boolean;
  privateIdProofBlobConfigured: boolean;
} {
  return {
    publicBlobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
    privateIdProofBlobConfigured: Boolean(
      process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN?.trim() ||
        process.env.ID_PROOF_READ_WRITE_TOKEN?.trim(),
    ),
  };
}

export function idProofErrorHttpStatus(code: IdProofUploadError["code"]): number {
  switch (code) {
    case "PRIVATE_BLOB_NOT_CONFIGURED":
      return 503;
    case "FILE_TOO_LARGE":
      return 413;
    case "INVALID_FILE":
    case "EMPTY_FILE":
      return 415;
    case "BLOB_UPLOAD_FAILED":
      return 502;
    default:
      return 500;
  }
}

const ID_PROOF_MAX_BYTES = 5 * 1024 * 1024;
const ID_PROOF_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ID_PROOF_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

function detectHeic(raw: Buffer): boolean {
  if (raw.length < 12) return false;
  const brand = raw.subarray(4, 12).toString("ascii");
  return /heic|heif|mif1|msf1/i.test(brand);
}

function sniffIdProofExtension(raw: Buffer): "jpg" | "png" | "webp" | null {
  if (raw.length >= 3 && raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff) return "jpg";
  if (
    raw.length >= 8 &&
    raw[0] === 0x89 &&
    raw[1] === 0x50 &&
    raw[2] === 0x4e &&
    raw[3] === 0x47
  ) {
    return "png";
  }
  if (raw.length >= 12 && raw.subarray(0, 4).toString("ascii") === "RIFF") {
    if (raw.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  }
  return null;
}

function normalizeIdProofExtension(ext: string): "jpg" | "png" | "webp" | null {
  const lower = ext.toLowerCase();
  if (lower === "jpeg") return "jpg";
  if (ID_PROOF_EXT.has(lower)) return lower as "jpg" | "png" | "webp";
  return null;
}

/** Validates bytes/MIME — shared by local and Vercel (no Sharp on serverless). */
export function validateIdProofUpload(file: File, raw: Buffer): "jpg" | "png" | "webp" {
  if (!raw.length) {
    throw new IdProofUploadError("ID photo file is empty.", "EMPTY_FILE");
  }
  if (raw.length > ID_PROOF_MAX_BYTES) {
    throw new IdProofUploadError("ID photo must be 5 MB or smaller.", "FILE_TOO_LARGE");
  }

  const mime = String(file.type || "")
    .trim()
    .toLowerCase();
  if (/heic|heif/.test(mime) || detectHeic(raw)) {
    throw new IdProofUploadError(
      "HEIC/HEIF is not supported. Retake or upload as JPG.",
      "INVALID_FILE",
    );
  }

  const sniffed = sniffIdProofExtension(raw);
  if (!sniffed) {
    throw new IdProofUploadError(
      "Unsupported image. Use JPG, PNG, or WEBP.",
      "INVALID_FILE",
    );
  }

  const nameExt = normalizeIdProofExtension(extFromName(file.name));
  if (nameExt && nameExt !== sniffed) {
    throw new IdProofUploadError(
      "File extension does not match image content.",
      "INVALID_FILE",
    );
  }

  if (mime && ID_PROOF_MIME.has(mime)) {
    const expectedMime =
      sniffed === "jpg" ? "image/jpeg" : sniffed === "png" ? "image/png" : "image/webp";
    if (mime !== expectedMime) {
      throw new IdProofUploadError(
        "Image type does not match file content.",
        "INVALID_FILE",
      );
    }
  } else if (mime && mime !== "application/octet-stream") {
    throw new IdProofUploadError(
      "Unsupported image type. Use JPG, PNG, or WEBP.",
      "INVALID_FILE",
    );
  }

  return sniffed;
}

export async function storePrivateIdProof(
  bytes: Buffer,
  extension: "jpg" | "png" | "webp",
): Promise<string> {
  try {
    return await savePrivateBookingMedia(bytes, "id-proofs", extension);
  } catch (e) {
    if (e instanceof PrivateMediaError) {
      throw new IdProofUploadError(e.message, e.code, { cause: e });
    }
    throw e;
  }
}

/** Private customer ID proof — never stored in public catalogue paths or public token. */
export async function saveIdProofUpload(file: File): Promise<string> {
  const raw = Buffer.from(await file.arrayBuffer());
  const extension = validateIdProofUpload(file, raw);

  if (process.env.VERCEL) {
    return storePrivateIdProof(raw, extension);
  }

  try {
    const meta = await sharp(raw, { failOn: "none", limitInputPixels: 40_000_000 }).metadata();
    if (!meta.format || !["jpeg", "jpg", "png", "webp"].includes(meta.format)) {
      throw new IdProofUploadError(
        "ID proof must be a valid image file.",
        "INVALID_FILE",
      );
    }
    if ((meta.width || 0) > 8000 || (meta.height || 0) > 8000) {
      throw new IdProofUploadError("ID proof image dimensions are too large.", "INVALID_FILE");
    }
  } catch (e) {
    if (e instanceof IdProofUploadError) throw e;
    throw new IdProofUploadError(
      "ID proof must be a valid image file.",
      "INVALID_FILE",
      { cause: e },
    );
  }

  return storePrivateIdProof(raw, extension);
}
