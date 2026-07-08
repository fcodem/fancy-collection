import sharp from "sharp";
import type { QualityScores } from "./types";

async function laplacianVariance(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer)
    .resize(256, 256, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const kernel = (x: number, y: number) => {
    const idx = y * w + x;
    const c = data[idx];
    const up = y > 0 ? data[(y - 1) * w + x] : c;
    const down = y < h - 1 ? data[(y + 1) * w + x] : c;
    const left = x > 0 ? data[y * w + x - 1] : c;
    const right = x < w - 1 ? data[y * w + x + 1] : c;
    return Math.abs(4 * c - up - down - left - right);
  };

  let sum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      sum += kernel(x, y);
      count++;
    }
  }
  const mean = sum / (count || 1);
  let variance = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = kernel(x, y);
      variance += (v - mean) ** 2;
    }
  }
  return variance / (count || 1);
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export async function scoreImageQuality(
  buffer: Buffer,
  options: {
    hasRecognitionImage?: boolean;
  } = {},
): Promise<QualityScores> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const aspect = w / h;

  const { data, info } = await sharp(buffer)
    .resize(128, 128, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sumLum = 0;
  let dark = 0;
  let bright = 0;
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const lum = 0.299 * data[i] + 0.587 * (data[i + 1] ?? data[i]) + 0.114 * (data[i + 2] ?? data[i]);
    sumLum += lum;
    if (lum < 40) dark++;
    if (lum > 220) bright++;
  }
  const avgLum = sumLum / pixels;
  const lighting = clampScore(100 - Math.abs(avgLum - 128) * 0.6 - (dark / pixels) * 80 - (bright / pixels) * 40);

  const lapVar = await laplacianVariance(buffer);
  const sharpness = clampScore(Math.min(100, lapVar / 8));

  const edgeRatio = bright / pixels;
  const backgroundQuality = clampScore(100 - edgeRatio * 120);

  const noise = clampScore(100 - Math.max(0, lapVar - 120) * 0.3);

  const perspective = clampScore(aspect > 0.5 && aspect < 2.2 ? 90 : 60);

  const colourAccuracy = clampScore(75 + (meta.channels && meta.channels >= 3 ? 15 : 0));

  const garmentVisibility = clampScore(
    (options.hasRecognitionImage ? 45 : 0) + sharpness * 0.35,
  );

  const embroideryVisibility = clampScore(sharpness * 0.7 + lighting * 0.3);

  const overallCatalogueQuality = clampScore(
    sharpness * 0.25 + lighting * 0.2 + backgroundQuality * 0.2 + garmentVisibility * 0.2 + embroideryVisibility * 0.15,
  );

  const overallRecognitionQuality = clampScore(
    sharpness * 0.35 + lighting * 0.25 + colourAccuracy * 0.2 + (options.hasRecognitionImage ? 20 : 0),
  );

  return {
    sharpness,
    lighting,
    backgroundQuality,
    noise,
    perspective,
    colourAccuracy,
    garmentVisibility,
    embroideryVisibility,
    overallCatalogueQuality,
    overallRecognitionQuality,
  };
}
