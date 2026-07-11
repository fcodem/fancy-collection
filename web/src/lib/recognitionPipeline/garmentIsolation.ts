import sharp from "sharp";
import type { GarmentBounds, ProcessedGarmentImage } from "./types";

const GRID = 8;
const SALIENCY_THRESHOLD = 0.35;

/**
 * Detect garment region via colour variance + edge energy saliency.
 * Ignores peripheral store background, racks, floor, and walls.
 */
export async function detectGarmentBounds(buffer: Buffer): Promise<GarmentBounds> {
  const meta = await sharp(buffer, { failOn: "none" }).rotate().metadata();
  const w = meta.width ?? 256;
  const h = meta.height ?? 256;

  const { data } = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(GRID * 16, GRID * 16, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const gw = GRID * 16;
  const gh = GRID * 16;
  const cellW = Math.floor(gw / GRID);
  const cellH = Math.floor(gh / GRID);
  const scores: number[][] = [];

  for (let gy = 0; gy < GRID; gy++) {
    scores[gy] = [];
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0;
      let sumSq = 0;
      let edge = 0;
      let count = 0;
      const x0 = gx * cellW;
      const y0 = gy * cellH;
      for (let y = y0 + 1; y < y0 + cellH - 1 && y < gh - 1; y++) {
        for (let x = x0 + 1; x < x0 + cellW - 1 && x < gw - 1; x++) {
          const i = (y * gw + x) * 3;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += lum;
          sumSq += lum * lum;
          const below = (y + 1) * gw + x;
          const right = y * gw + (x + 1);
          const lumB = 0.299 * data[below * 3] + 0.587 * data[below * 3 + 1] + 0.114 * data[below * 3 + 2];
          const lumR = 0.299 * data[right * 3] + 0.587 * data[right * 3 + 1] + 0.114 * data[right * 3 + 2];
          edge += Math.abs(lum - lumB) + Math.abs(lum - lumR);
          count++;
        }
      }
      const mean = count ? sum / count : 0;
      const variance = count ? sumSq / count - mean * mean : 0;
      const edgeNorm = count ? edge / count : 0;
      const cx = (gx + 0.5) / GRID - 0.5;
      const cy = (gy + 0.5) / GRID - 0.5;
      const centerWeight = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) * 1.4);
      scores[gy][gx] = (variance * 0.55 + edgeNorm * 0.45) * (0.4 + centerWeight * 0.6);
    }
  }

  let maxScore = 0;
  for (const row of scores) for (const s of row) maxScore = Math.max(maxScore, s);
  const threshold = maxScore * SALIENCY_THRESHOLD;

  let minGx = GRID;
  let minGy = GRID;
  let maxGx = 0;
  let maxGy = 0;
  let found = false;

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      if (scores[gy][gx] >= threshold) {
        found = true;
        minGx = Math.min(minGx, gx);
        minGy = Math.min(minGy, gy);
        maxGx = Math.max(maxGx, gx);
        maxGy = Math.max(maxGy, gy);
      }
    }
  }

  if (!found) {
    return {
      left: Math.round(w * 0.1),
      top: Math.round(h * 0.05),
      width: Math.round(w * 0.8),
      height: Math.round(h * 0.9),
    };
  }

  const pad = 0.05;
  const left = Math.max(0, Math.round((minGx / GRID - pad) * w));
  const top = Math.max(0, Math.round((minGy / GRID - pad) * h));
  const right = Math.min(w, Math.round(((maxGx + 1) / GRID + pad) * w));
  const bottom = Math.min(h, Math.round(((maxGy + 1) / GRID + pad) * h));

  return {
    left,
    top,
    width: Math.max(32, right - left),
    height: Math.max(32, bottom - top),
  };
}

/** Sample average RGB from image corners (likely background). */
async function sampleCornerBackground(data: Buffer, w: number, h: number): Promise<[number, number, number]> {
  const corners = [
    0,
    (w - 1) * 3,
    (h - 1) * w * 3,
    ((h - 1) * w + (w - 1)) * 3,
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of corners) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [r / 4, g / 4, b / 4];
}

/** Remove background via corner-chroma distance mask + radial vignette. */
async function suppressBackground(cropped: Buffer, cw: number, ch: number): Promise<Buffer> {
  const { data } = await sharp(cropped).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [bgR, bgG, bgB] = await sampleCornerBackground(data, cw, ch);

  const masked = Buffer.alloc(data.length);
  const cx = cw / 2;
  const cy = ch / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 3;
      const dr = data[i] - bgR;
      const dg = data[i + 1] - bgG;
      const db = data[i + 2] - bgB;
      const chromaDist = Math.sqrt(dr * dr + dg * dg + db * db);
      const edgeDist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
      const isForeground = chromaDist > 28 || edgeDist < 0.55;
      const alpha = isForeground ? 1 : Math.max(0, 1 - (28 - chromaDist) / 28) * (1 - edgeDist * 0.5);
      masked[i] = Math.round(data[i] * alpha + 240 * (1 - alpha));
      masked[i + 1] = Math.round(data[i + 1] * alpha + 240 * (1 - alpha));
      masked[i + 2] = Math.round(data[i + 2] * alpha + 240 * (1 - alpha));
    }
  }

  return sharp(masked, { raw: { width: cw, height: ch, channels: 3 } })
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer();
}

/** Crop to garment bounds and remove background (chroma key + vignette). */
export async function isolateGarment(buffer: Buffer): Promise<ProcessedGarmentImage> {
  const rotated = await sharp(buffer, { failOn: "none" }).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const w = meta.width ?? 256;
  const h = meta.height ?? 256;
  const bounds = await detectGarmentBounds(rotated);

  const cropped = await sharp(rotated)
    .extract({
      left: Math.min(bounds.left, w - 32),
      top: Math.min(bounds.top, h - 32),
      width: Math.min(bounds.width, w - bounds.left),
      height: Math.min(bounds.height, h - bounds.top),
    })
    .toBuffer();

  const cropMeta = await sharp(cropped).metadata();
  const cw = cropMeta.width ?? bounds.width;
  const ch = cropMeta.height ?? bounds.height;

  const suppressed = await suppressBackground(cropped, cw, ch);

  return {
    buffer: suppressed,
    bounds: { left: bounds.left, top: bounds.top, width: cw, height: ch },
    originalWidth: w,
    originalHeight: h,
    backgroundSuppressed: true,
  };
}
