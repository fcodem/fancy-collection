import sharp from "sharp";
import {
  computeAverageHash,
  computeDifferenceHash,
  type FabricColorFamily,
} from "../photoHash";
import { extractDressColoursLab, type DressColourDiagnostics } from "../dressChecker/dressColourLab";
import type { GarmentBounds } from "./types";

export async function extractDominantColours(buf: Buffer): Promise<{
  primary: string;
  secondary: string;
  accents: string[];
  histogram: number[];
  family: FabricColorFamily;
  diagnostics: DressColourDiagnostics;
}> {
  const result = await extractDressColoursLab(buf);
  return {
    primary: result.primary,
    secondary: result.secondary,
    accents: result.accents,
    histogram: result.histogram,
    family: result.family,
    diagnostics: result.diagnostics,
  };
}

async function regionCrop(buf: Buffer, w: number, h: number, l: number, t: number, rw: number, rh: number) {
  return sharp(buf)
    .extract({
      left: Math.max(0, Math.min(l, w - rw)),
      top: Math.max(0, Math.min(t, h - rh)),
      width: Math.min(rw, w),
      height: Math.min(rh, h),
    })
    .toBuffer();
}

export async function analyzeTexture(buf: Buffer): Promise<number[]> {
  const { data } = await sharp(buf)
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const descriptor: number[] = [];
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 31; x++) {
      const idx = y * 32 + x;
      descriptor.push(Math.abs(data[idx] - data[y * 32 + x + 1]));
      descriptor.push(Math.abs(data[idx] - data[(y + 1) * 32 + x]));
    }
  }
  const bins = 16;
  const hist = new Array<number>(bins).fill(0);
  for (const v of descriptor) {
    hist[Math.min(bins - 1, Math.floor((v / 256) * bins))]++;
  }
  const total = descriptor.length || 1;
  return hist.map((v) => Math.round((v / total) * 10000) / 10000);
}

export async function analyzeEmbroidery(buf: Buffer): Promise<{
  density: number;
  style: string;
  stoneWork: boolean;
  mirrorWork: boolean;
  threadPattern: number[];
}> {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  let highFreq = 0;
  let sparkle = 0;
  const threadPattern = new Array<number>(8).fill(0);
  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = data[y * w + x];
      const lap =
        -4 * c +
        data[(y - 1) * w + x] +
        data[(y + 1) * w + x] +
        data[y * w + (x - 1)] +
        data[y * w + (x + 1)];
      const e = Math.abs(lap);
      highFreq += e;
      if (c > 220) sparkle++;
      threadPattern[Math.min(7, Math.floor(e / 32))]++;
    }
  }
  const pixels = info.width * info.height;
  const density = Math.round((highFreq / pixels) * 10) / 10;
  const sparkleRatio = sparkle / pixels;
  const total = threadPattern.reduce((s, v) => s + v, 0) || 1;
  const normalized = threadPattern.map((v) => Math.round((v / total) * 1000) / 1000);
  let style = "minimal";
  if (density > 25) style = "heavy";
  else if (density > 12) style = "moderate";
  else if (density > 5) style = "light";
  return {
    density,
    style,
    stoneWork: sparkleRatio > 0.02 && density > 8,
    mirrorWork: sparkleRatio > 0.04,
    threadPattern: normalized,
  };
}

export async function analyzeBorder(buf: Buffer): Promise<{
  averageHash: string;
  differenceHash: string;
  widthRatio: number;
}> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 256;
  const h = meta.height ?? 256;
  const borderH = Math.max(8, Math.round(h * 0.18));
  const borderBuf = await regionCrop(buf, w, h, 0, h - borderH, w, borderH);
  const [aHash, dHash] = await Promise.all([
    computeAverageHash(borderBuf).then((h) => h.toString()),
    computeDifferenceHash(borderBuf).then((h) => h.toString()),
  ]);
  return { averageHash: aHash, differenceHash: dHash, widthRatio: borderH / h };
}

export async function analyzeSleeve(buf: Buffer): Promise<string> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 256;
  const h = meta.height ?? 256;
  const topBuf = await regionCrop(buf, w, h, 0, 0, w, Math.round(h * 0.28));
  const { data, info } = await sharp(topBuf)
    .resize(32, 16, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sideEnergy = 0;
  let centerEnergy = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const e = data[y * info.width + x];
      if (x < 6 || x > info.width - 7) sideEnergy += e;
      else centerEnergy += e;
    }
  }
  const ratio = sideEnergy / (centerEnergy + 1);
  if (ratio > 1.8) return "full";
  if (ratio > 1.2) return "three-quarter";
  if (ratio > 0.8) return "half";
  return "sleeveless";
}

export async function analyzeNeckline(buf: Buffer): Promise<string> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 256;
  const h = meta.height ?? 256;
  const neckBuf = await regionCrop(buf, w, h, Math.round(w * 0.3), 0, Math.round(w * 0.4), Math.round(h * 0.15));
  const { data, info } = await sharp(neckBuf)
    .resize(24, 16, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let topDark = 0;
  let centerBright = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const v = data[y * info.width + x];
      if (y < 4) topDark += 255 - v;
      else centerBright += v;
    }
  }
  const depth = topDark / (centerBright + 1);
  if (depth > 2.5) return "deep-v";
  if (depth > 1.5) return "v-neck";
  if (depth > 0.8) return "round";
  return "high-neck";
}

export async function analyzeSilhouette(buf: Buffer, bounds: GarmentBounds): Promise<{
  silhouette: string;
  garmentShape: string;
}> {
  const aspect = bounds.width / Math.max(1, bounds.height);
  if (aspect < 0.55) return { silhouette: "flared", garmentShape: "a-line" };
  if (aspect < 0.75) return { silhouette: "volume", garmentShape: "lehenga" };
  if (aspect > 1.1) return { silhouette: "fitted", garmentShape: "straight" };
  return { silhouette: "balanced", garmentShape: "standard" };
}

export async function analyzeDupatta(buf: Buffer): Promise<{
  pattern: string | null;
  border: string | null;
}> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 256;
  const h = meta.height ?? 256;
  const leftBuf = await regionCrop(buf, w, h, 0, Math.round(h * 0.1), Math.round(w * 0.2), Math.round(h * 0.7));
  const rightBuf = await regionCrop(buf, w, h, Math.round(w * 0.8), Math.round(h * 0.1), Math.round(w * 0.2), Math.round(h * 0.7));
  const [leftVar, rightVar] = await Promise.all([regionVariance(leftBuf), regionVariance(rightBuf)]);
  const centerVar = await regionVariance(
    await regionCrop(buf, w, h, Math.round(w * 0.3), Math.round(h * 0.2), Math.round(w * 0.4), Math.round(h * 0.6)),
  );
  if (leftVar > centerVar * 1.3 || rightVar > centerVar * 1.3) {
    const side = leftVar > rightVar ? leftBuf : rightBuf;
    const [a, d] = await Promise.all([
      computeAverageHash(side).then((h) => h.toString()),
      computeDifferenceHash(side).then((h) => h.toString()),
    ]);
    return { pattern: a.slice(0, 8), border: d.slice(0, 8) };
  }
  return { pattern: null, border: null };
}

async function regionVariance(buf: Buffer): Promise<number> {
  const stats = await sharp(buf).greyscale().stats();
  return stats.channels[0]?.stdev ?? 0;
}

export async function computeOrbLikeFeatures(buf: Buffer): Promise<{
  keypoints: number[];
  descriptors: number[];
  motifDistribution: number[];
}> {
  const size = 24;
  const { data, info } = await sharp(buf)
    .resize(size, size, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const keypoints: number[] = [];
  const descriptors: number[] = [];
  const motifDistribution = new Array<number>(9).fill(0);

  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const center = data[y * size + x];
      let isExtrema = true;
      let sum = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dy === 0 && dx === 0) continue;
          const n = data[(y + dy) * size + (x + dx)];
          sum += n;
          count++;
          if ((center >= n && center > 128) || (center <= n && center < 128)) isExtrema = false;
        }
      }
      if (isExtrema) {
        keypoints.push(x / size, y / size, center / 255);
        const patch: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            patch.push(data[(y + dy) * size + (x + dx)] / 255);
          }
        }
        descriptors.push(...patch);
        const cellX = Math.min(2, Math.floor((x / size) * 3));
        const cellY = Math.min(2, Math.floor((y / size) * 3));
        motifDistribution[cellY * 3 + cellX]++;
      }
    }
  }

  const total = motifDistribution.reduce((s, v) => s + v, 0) || 1;
  return {
    keypoints: keypoints.slice(0, 60),
    descriptors: descriptors.slice(0, 81),
    motifDistribution: motifDistribution.map((v) => Math.round((v / total) * 1000) / 1000),
  };
}

export async function scoreImageQuality(buf: Buffer): Promise<number> {
  const stats = await sharp(buf).stats();
  const mean = stats.channels[0]?.mean ?? 128;
  const stdev = stats.channels[0]?.stdev ?? 30;
  const exposure = 100 - Math.abs(mean - 140) * 0.5;
  const contrast = Math.min(100, stdev * 2);
  return Math.round(Math.min(100, exposure * 0.5 + contrast * 0.5));
}
