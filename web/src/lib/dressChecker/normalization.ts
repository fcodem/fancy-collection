import sharp from "sharp";
import { RECOGNITION_IMAGE_SIZE } from "./constants";

/**
 * Stage 1 — Image normalization before recognition.
 * Auto-rotate (EXIF), brightness, contrast, shadow reduction.
 * Preserves garment geometry; does not warp the dress shape.
 */
export async function normalizeGarmentImage(buffer: Buffer): Promise<Buffer> {
  const rotated = await sharp(buffer, { failOn: "none" }).rotate().toBuffer();

  return sharp(rotated)
    .normalize()
    .modulate({ brightness: 1.02, saturation: 1.04 })
    .linear(1.06, -(0.04 * 128))
    .gamma(1.02)
    .resize(RECOGNITION_IMAGE_SIZE, RECOGNITION_IMAGE_SIZE, {
      fit: "inside",
      withoutEnlargement: false,
      background: { r: 248, g: 248, b: 248 },
    })
    .sharpen({ sigma: 0.6, m1: 0.5, m2: 0.3 })
    .jpeg({ quality: 96, mozjpeg: true })
    .toBuffer();
}

/** Rotation-invariant query variants (0°, 90°, 180°, 270°). */
export async function buildRotationVariants(buffer: Buffer): Promise<Array<{ source: string; buffer: Buffer }>> {
  const base = await normalizeGarmentImage(buffer);
  const variants: Array<{ source: string; buffer: Buffer }> = [{ source: "normalized_0", buffer: base }];

  for (const deg of [90, 180, 270]) {
    variants.push({
      source: `normalized_${deg}`,
      buffer: await sharp(base).rotate(deg).jpeg({ quality: 94 }).toBuffer(),
    });
  }
  return variants;
}
