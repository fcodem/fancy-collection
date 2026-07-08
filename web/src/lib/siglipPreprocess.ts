import sharp from "sharp";

/** SigLIP-base-patch16-224 expects 224×224 via AutoProcessor (center crop + resize). */
export const SIGLIP_MODEL_ID = "Xenova/siglip-base-patch16-224";
export const SIGLIP_EMBEDDING_DIM = 768;
export const SIGLIP_MASTER_MAX_EDGE = 2048;
export const SIGLIP_JPEG_QUALITY = 92;

/**
 * Master image preparation — used identically for inventory indexing AND search uploads.
 * EXIF orientation, RGB JPEG, aspect ratio preserved (fit inside), no stretch.
 */
export async function prepareSiglipMasterImage(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions");
  }
  return sharp(buffer, { failOn: "none", animated: false })
    .rotate()
    .resize(SIGLIP_MASTER_MAX_EDGE, SIGLIP_MASTER_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .jpeg({ quality: SIGLIP_JPEG_QUALITY, force: true })
    .toBuffer();
}

export type CropSpec = {
  wRatio: number;
  hRatio: number;
  leftRatio: number;
  topRatio: number;
};

/**
 * Extract a region from an already-prepared master image.
 * No stretch — native aspect crop only; SigLIP processor handles 224×224 resize.
 */
export async function extractSiglipCrop(master: Buffer, spec: CropSpec): Promise<Buffer> {
  const meta = await sharp(master).metadata();
  const width = Math.max(meta.width ?? 1, 1);
  const height = Math.max(meta.height ?? 1, 1);

  if (spec.wRatio >= 0.99 && spec.hRatio >= 0.99) {
    return master;
  }

  const w = Math.max(64, Math.round(width * spec.wRatio));
  const h = Math.max(64, Math.round(height * spec.hRatio));
  const left = Math.max(0, Math.min(width - w, Math.round(width * spec.leftRatio)));
  const top = Math.max(0, Math.min(height - h, Math.round(height * spec.topRatio)));

  return sharp(master)
    .extract({ left, top, width: w, height: h })
    .removeAlpha()
    .jpeg({ quality: SIGLIP_JPEG_QUALITY, force: true })
    .toBuffer();
}

/** Minimal prep for embedding input — no second full resize if already prepared. */
export async function prepareSiglipEmbeddingInput(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer, { failOn: "none", animated: false }).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions");
  }
  return sharp(buffer, { failOn: "none", animated: false })
    .rotate()
    .removeAlpha()
    .jpeg({ quality: SIGLIP_JPEG_QUALITY, force: true })
    .toBuffer();
}

export async function imageDimensions(buffer: Buffer): Promise<{ width: number; height: number; bytes: number }> {
  const meta = await sharp(buffer).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    bytes: buffer.length,
  };
}
