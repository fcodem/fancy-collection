import sharp from "sharp";
import { DRESS_CHECKER_MAX_PHOTO_BYTES } from "./dressCheckerConstants";

export type ImageValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; message: string };

const MIN_EDGE = 120;
const MIN_BYTES = 100;
const BLUR_THRESHOLD = 80;

export async function validateDressCheckerImage(
  buffer: Buffer,
  mime?: string,
): Promise<ImageValidationResult> {
  const warnings: string[] = [];

  if (buffer.length < MIN_BYTES) {
    return { ok: false, message: "Image file is empty or corrupted. Please upload a valid photo." };
  }
  if (buffer.length > DRESS_CHECKER_MAX_PHOTO_BYTES) {
    return {
      ok: false,
      message: `Image is too large (max ${DRESS_CHECKER_MAX_PHOTO_BYTES / (1024 * 1024)}MB).`,
    };
  }

  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (mime && !allowed.includes(mime.toLowerCase())) {
    return { ok: false, message: "Unsupported format. Use JPG, PNG, or WEBP." };
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  } catch {
    return { ok: false, message: "Could not read this image. The file may be corrupted." };
  }

  if (!meta.width || !meta.height) {
    return { ok: false, message: "Could not read image dimensions." };
  }

  if (meta.width < MIN_EDGE || meta.height < MIN_EDGE) {
    return {
      ok: false,
      message: "Image resolution is too low. Move closer or use a higher quality photo.",
    };
  }

  const stats = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .greyscale()
    .stats();

  const mean = stats.channels[0]?.mean ?? 128;
  if (mean < 35) {
    warnings.push("Photo is very dark — try better lighting.");
  } else if (mean > 220) {
    warnings.push("Photo may be overexposed — reduce brightness or glare.");
  }

  const laplacian = await estimateBlur(buffer);
  if (laplacian < BLUR_THRESHOLD) {
    warnings.push("Photo appears blurry — hold steady and focus on the dress.");
  }

  return { ok: true, warnings };
}

async function estimateBlur(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(128, 128, { fit: "cover" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  let sum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = data[y * w + x];
      const lap =
        -4 * c +
        data[(y - 1) * w + x] +
        data[(y + 1) * w + x] +
        data[y * w + (x - 1)] +
        data[y * w + (x + 1)];
      sum += lap * lap;
      count++;
    }
  }
  return count ? sum / count : 0;
}
