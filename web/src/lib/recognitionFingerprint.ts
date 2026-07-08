import sharp from "sharp";
import { computeAverageHash, computeDifferenceHash, computeColorHistogram, detectFabricColorFamily } from "./photoHash";

export type RecognitionFingerprint = {
  version: 1;
  colorHistogram: number[];
  colorFamily: string;
  averageHash: string;
  differenceHash: string;
  textureDescriptor: number[];
  localKeypoints: number[];
  regionHashes: {
    centre: { aHash: string; dHash: string };
    top: { aHash: string; dHash: string };
    bottom: { aHash: string; dHash: string };
    left: { aHash: string; dHash: string };
    right: { aHash: string; dHash: string };
  };
  dominantColors: Array<{ r: number; g: number; b: number; weight: number }>;
};

async function regionCrop(
  buf: Buffer,
  w: number,
  h: number,
  left: number,
  top: number,
  rw: number,
  rh: number,
): Promise<Buffer> {
  return sharp(buf)
    .extract({
      left: Math.max(0, Math.min(left, w - rw)),
      top: Math.max(0, Math.min(top, h - rh)),
      width: Math.min(rw, w),
      height: Math.min(rh, h),
    })
    .toBuffer();
}

async function regionHash(buf: Buffer): Promise<{ aHash: string; dHash: string }> {
  const [a, d] = await Promise.all([computeAverageHash(buf), computeDifferenceHash(buf)]);
  return { aHash: a.toString(), dHash: d.toString() };
}

async function computeTextureDescriptor(buf: Buffer): Promise<number[]> {
  const { data } = await sharp(buf)
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const descriptor: number[] = [];
  for (let y = 0; y < 31; y++) {
    for (let x = 0; x < 31; x++) {
      const idx = y * 32 + x;
      const right = y * 32 + x + 1;
      const below = (y + 1) * 32 + x;
      descriptor.push(Math.abs(data[idx] - data[right]));
      descriptor.push(Math.abs(data[idx] - data[below]));
    }
  }

  const bins = 16;
  const hist = new Array<number>(bins).fill(0);
  for (const v of descriptor) {
    const bin = Math.min(bins - 1, Math.floor((v / 256) * bins));
    hist[bin]++;
  }
  const total = descriptor.length || 1;
  return hist.map((v) => Math.round((v / total) * 10000) / 10000);
}

async function computeLocalKeypoints(buf: Buffer): Promise<number[]> {
  const size = 16;
  const { data } = await sharp(buf)
    .resize(size, size, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const keypoints: number[] = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const center = data[y * size + x];
      let isMax = true;
      let isMin = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const neighbor = data[(y + dy) * size + (x + dx)];
          if (neighbor >= center) isMax = false;
          if (neighbor <= center) isMin = false;
        }
      }
      if (isMax || isMin) {
        keypoints.push(x / size, y / size, center / 255);
      }
    }
  }
  return keypoints.slice(0, 60);
}

async function extractDominantColors(
  buf: Buffer,
): Promise<Array<{ r: number; g: number; b: number; weight: number }>> {
  const { data } = await sharp(buf)
    .resize(64, 64, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const pixels = data.length / 3;

  for (let i = 0; i < data.length; i += 3) {
    const rq = Math.round(data[i] / 32) * 32;
    const gq = Math.round(data[i + 1] / 32) * 32;
    const bq = Math.round(data[i + 2] / 32) * 32;
    const key = `${rq},${gq},${bq}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.r += data[i];
      existing.g += data[i + 1];
      existing.b += data[i + 2];
      existing.count++;
    } else {
      buckets.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], count: 1 });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((b) => ({
      r: Math.round(b.r / b.count),
      g: Math.round(b.g / b.count),
      b: Math.round(b.b / b.count),
      weight: Math.round((b.count / pixels) * 10000) / 10000,
    }));
}

export async function computeRecognitionFingerprint(
  buffer: Buffer,
): Promise<RecognitionFingerprint> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 256;
  const h = meta.height ?? 256;

  const hw = Math.round(w / 2);
  const hh = Math.round(h / 2);

  const [
    colorHistogram,
    colorFamily,
    averageHash,
    differenceHash,
    textureDescriptor,
    localKeypoints,
    dominantColors,
    centreHash,
    topHash,
    bottomHash,
    leftHash,
    rightHash,
  ] = await Promise.all([
    computeColorHistogram(buffer),
    detectFabricColorFamily(buffer),
    computeAverageHash(buffer).then((h) => h.toString()),
    computeDifferenceHash(buffer).then((h) => h.toString()),
    computeTextureDescriptor(buffer),
    computeLocalKeypoints(buffer),
    extractDominantColors(buffer),
    regionCrop(buffer, w, h, Math.round(w * 0.25), Math.round(h * 0.25), hw, hh).then(regionHash),
    regionCrop(buffer, w, h, 0, 0, w, hh).then(regionHash),
    regionCrop(buffer, w, h, 0, hh, w, hh).then(regionHash),
    regionCrop(buffer, w, h, 0, 0, hw, h).then(regionHash),
    regionCrop(buffer, w, h, hw, 0, hw, h).then(regionHash),
  ]);

  return {
    version: 1,
    colorHistogram,
    colorFamily,
    averageHash,
    differenceHash,
    textureDescriptor,
    localKeypoints,
    regionHashes: {
      centre: centreHash,
      top: topHash,
      bottom: bottomHash,
      left: leftHash,
      right: rightHash,
    },
    dominantColors,
  };
}
