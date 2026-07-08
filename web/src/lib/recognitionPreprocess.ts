import sharp from "sharp";

/**
 * Recognition-optimized preprocessing for AI Dress Checker.
 *
 * Allowed: EXIF rotate, normalize exposure/white-balance, slight denoise,
 * mild sharpen, resize to AI input resolution, preserve aspect ratio,
 * preserve colours / embroidery / texture / folds.
 *
 * Never: replace background, add mannequins, change lighting/pose/perspective,
 * modify colours/embroidery, smooth textures, stylize.
 */

const RECOGNITION_MAX_EDGE = 2048;
const RECOGNITION_JPEG_QUALITY = 95;

export async function buildRecognitionImage(rawBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(rawBuffer, { failOn: "none", animated: false }).metadata();
  if (!meta.width || !meta.height) throw new Error("Cannot read image dimensions");

  let pipeline = sharp(rawBuffer, { failOn: "none", animated: false })
    .rotate()
    .resize(RECOGNITION_MAX_EDGE, RECOGNITION_MAX_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha();

  pipeline = pipeline.normalise();

  pipeline = pipeline.sharpen({ sigma: 0.8, m1: 0.5, m2: 0.3 });

  pipeline = pipeline.median(3);

  return pipeline
    .jpeg({ quality: RECOGNITION_JPEG_QUALITY, mozjpeg: true, force: true })
    .toBuffer();
}
