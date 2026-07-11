import sharp from "sharp";

const HASH_BITS = 256;

/** Decode any upload (HEIC/EXIF/WebP) into a flat JPEG safe for hashing and SigLIP. */
export async function normalizeImageBuffer(buffer: Buffer): Promise<Buffer> {
  const { prepareSiglipMasterImage } = await import("./siglipPreprocess");
  return prepareSiglipMasterImage(buffer);
}

/** Landscape / screenshot uploads — try several crops so a small dress thumbnail still matches. */
export async function querySearchVariants(buffer: Buffer): Promise<Buffer[]> {
  const normalized = await normalizeImageBuffer(buffer);
  const meta = await sharp(normalized).metadata();
  const w = meta.width ?? 512;
  const h = meta.height ?? 512;
  const positions = ["centre", "northwest", "left", "south", "north"] as const;
  const variants: Buffer[] = [];
  for (const pos of positions) {
    variants.push(
      await sharp(normalized)
        .resize(512, 512, { fit: "cover", position: pos })
        .jpeg({ quality: 90 })
        .toBuffer(),
    );
  }
  if (w / h > 1.25) {
    variants.push(
      await sharp(normalized)
        .resize(384, 512, { fit: "cover", position: "left" })
        .jpeg({ quality: 90 })
        .toBuffer(),
    );
  }
  return variants;
}

/** Wide images with large bright margins are usually UI screenshots, not dress photos. */
export async function isLikelyScreenshot(buffer: Buffer): Promise<boolean> {
  const normalized = await normalizeImageBuffer(buffer);
  const meta = await sharp(normalized).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  if (w / h < 1.2) return false;
  const { data } = await sharp(normalized)
    .resize(160, 90, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bright = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 235 && g > 235 && b > 235) bright++;
  }
  const pixels = data.length / 3;
  return bright / pixels > 0.35;
}

async function designRegionBuffer(normalized: Buffer, ratio = 0.72): Promise<Buffer> {
  const meta = await sharp(normalized).metadata();
  const w = Math.max(meta.width ?? 64, 1);
  const h = Math.max(meta.height ?? 64, 1);
  const side = Math.max(16, Math.round(Math.min(w, h) * ratio));
  return sharp(normalized)
    .resize(side, side, { fit: "cover", position: "centre" })
    .toBuffer();
}

/** Average-hash (aHash): 16×16 grayscale, threshold vs mean. */
export async function computeAverageHash(buffer: Buffer): Promise<bigint> {
  const { data } = await sharp(buffer)
    .resize(16, 16, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = [...data];
  const avg = pixels.reduce((s, p) => s + p, 0) / pixels.length;
  let hash = BigInt(0);
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] >= avg) hash |= BigInt(1) << BigInt(i);
  }
  return hash;
}

/** Difference-hash (dHash): 9×8, horizontal gradients — more angle-tolerant than aHash. */
export async function computeDifferenceHash(buffer: Buffer): Promise<bigint> {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = BigInt(0);
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      if (left < right) hash |= BigInt(1) << BigInt(bit);
      bit++;
    }
  }
  return hash;
}

/** Dominant-color histogram (12 hue × 3 saturation bins). Stable across camera angle. */
export async function computeColorHistogram(buffer: Buffer): Promise<number[]> {
  const bins = 36;
  const hist = new Array<number>(bins).fill(0);
  const { data } = await sharp(buffer)
    .resize(96, 96, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 0.08 || max < 0.12 || max > 0.98) continue;

    let h = 0;
    if (delta > 0) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h /= 6;
      if (h < 0) h += 1;
    }
    const s = delta / (max || 1);
    const hueBin = Math.min(11, Math.floor(h * 12));
    const satBin = s < 0.35 ? 0 : s < 0.65 ? 1 : 2;
    if (satBin < 1) {
      // Include muted fabric hues (sage green, navy) skipped by vivid-only bins.
      if (delta >= 0.04 && max < 0.96) {
        hist[hueBin * 3] += 1;
      }
      continue;
    }
    hist[hueBin * 3 + satBin] += 1;
  }

  const total = hist.reduce((s, v) => s + v, 0);
  if (total <= 0) return hist;
  return hist.map((v) => v / total);
}

export type FabricColorFamily = "green" | "blue" | "red" | "pink" | "yellow" | "multi" | "neutral" | "unknown";

const INCOMPATIBLE_COLOR_FAMILIES: [FabricColorFamily, FabricColorFamily][] = [
  ["green", "blue"],
  ["green", "red"],
  ["green", "multi"],
  ["blue", "red"],
  ["blue", "pink"],
  ["blue", "multi"],
];

export type ImageFingerprint = {
  averageHash: bigint;
  differenceHash: bigint;
  colorHistogram: number[];
  colorFamily: FabricColorFamily;
  centreHash?: { averageHash: bigint; differenceHash: bigint };
  bottomHash?: { averageHash: bigint; differenceHash: bigint };
  topHash?: { averageHash: bigint; differenceHash: bigint };
};

/** Classify garment fabric colour from body-region pixels (ignores gold hem / background). */
export async function detectFabricColorFamily(buffer: Buffer): Promise<FabricColorFamily> {
  const normalized = await sharp(buffer, { failOn: "none" }).rotate().toBuffer();
  const { data, info } = await sharp(normalized)
    .resize(120, 160, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const classifyRegion = (xStartPct: number, xEndPct: number, yStartPct: number, yEndPct: number) => {
    const counts = { green: 0, blue: 0, red: 0, pink: 0, yellow: 0, neutral: 0 };
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let fabricPixels = 0;

    const width = info.width ?? 120;
    const height = info.height ?? 160;
    const xStart = Math.floor(width * xStartPct);
    const xEnd = Math.floor(width * xEndPct);
    const yStart = Math.floor(height * yStartPct);
    const yEnd = Math.floor(height * yEndPct);

    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const i = (y * width + x) * 3;
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        if (max < 0.12 || max > 0.98 || delta < 0.05) {
          counts.neutral++;
          continue;
        }

        fabricPixels++;
        sumR += r;
        sumG += g;
        sumB += b;

        let hue = 0;
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue /= 6;
        if (hue < 0) hue += 1;
        const sat = delta / max;

        if (sat >= 0.08 && hue >= 0.17 && hue <= 0.48 && g >= r * 0.88) {
          counts.green++;
          continue;
        }
        const isBlueHue = hue >= 0.52 && hue <= 0.78;
        const blueDominant = b >= r * 1.02 && b >= g * 0.92;
        const darkNavy = max < 0.55 && b > r + 0.04 && b >= g - 0.03;
        if ((isBlueHue && blueDominant && sat >= 0.06) || darkNavy) {
          counts.blue++;
          continue;
        }
        const isRedHue = hue <= 0.05 || hue >= 0.92;
        if (isRedHue && sat >= 0.14 && r > g * 1.08 && r > b * 1.12) {
          counts.red++;
          continue;
        }
        if (sat >= 0.12 && hue >= 0.78 && hue <= 0.92 && r > 0.35) {
          counts.pink++;
          continue;
        }
        if (sat >= 0.1 && hue >= 0.08 && hue <= 0.16 && r > 0.4 && g > 0.3) {
          counts.yellow++;
          continue;
        }
        counts.neutral++;
      }
    }

    return { counts, fabricPixels, sumR, sumG, sumB };
  };

  const decide = (counts: ReturnType<typeof classifyRegion>["counts"], fabricPixels: number, sumR: number, sumG: number, sumB: number): FabricColorFamily | null => {
    const chroma = counts.red + counts.green + counts.blue + counts.yellow + counts.pink;
    if (chroma < 6) return null;

    if (counts.green >= 50 && counts.green >= counts.red * 0.75 && counts.green >= counts.yellow) {
      return "green";
    }
    if (counts.green >= 40 && counts.green >= counts.red * 1.25 && counts.green >= counts.blue) {
      return "green";
    }
    if (counts.blue >= 80 && counts.blue >= counts.red * 0.5) return "blue";
    if (counts.red >= 350 && counts.yellow >= 350) return "multi";
    if (counts.red >= 180 && counts.green >= 70) return "multi";
    if (counts.red >= 150 && counts.yellow >= 150 && counts.green >= 40) return "multi";
    if (counts.red >= 90 && counts.green >= 35 && counts.yellow >= 30) return "multi";
    if (counts.red >= 110 && (counts.green >= 28 || counts.yellow >= 28)) return "multi";

    if (counts.blue >= 350 && counts.blue >= counts.red * 0.5) return "blue";

    if (fabricPixels > 0) {
      const avgR = sumR / fabricPixels;
      const avgB = sumB / fabricPixels;
      if (counts.blue >= 80 && counts.blue >= counts.red * 0.4 && avgB >= avgR - 0.08) {
        return "blue";
      }
    }

    const ranked: [FabricColorFamily, number][] = [
      ["blue", counts.blue],
      ["green", counts.green],
      ["red", counts.red],
      ["yellow", counts.yellow],
      ["pink", counts.pink],
    ];
    ranked.sort((a, b) => b[1] - a[1]);
    if (ranked[0][1] < 6) return null;
    return ranked[0][0];
  };

  const centre = classifyRegion(0.28, 0.72, 0.22, 0.58);
  const centreFamily = decide(centre.counts, centre.fabricPixels, centre.sumR, centre.sumG, centre.sumB);

  const designBuf = await designRegionBuffer(normalized).catch(() => normalized);
  const hist = await computeColorHistogram(designBuf);
  const histogramIsMulti = histogramIndicatesMulti(hist);

  if (centreFamily && centreFamily !== "unknown") {
    if (histogramIsMulti && centreFamily !== "multi" && centreFamily !== "green" && centreFamily !== "blue") {
      return "multi";
    }
    return centreFamily;
  }

  const body = classifyRegion(0.18, 0.82, 0.14, 0.62);
  const bodyFamily = decide(body.counts, body.fabricPixels, body.sumR, body.sumG, body.sumB);
  if (bodyFamily) {
    if (histogramIsMulti && bodyFamily !== "multi" && bodyFamily !== "green" && bodyFamily !== "blue") {
      return "multi";
    }
    return bodyFamily;
  }

  const band = (from: number, to: number) => {
    let s = 0;
    for (let h = from; h <= to; h++) s += hist[h * 3] + hist[h * 3 + 1] + hist[h * 3 + 2];
    return s;
  };
  const blue = band(5, 7);
  const green = band(2, 4);
  const yellow = band(8, 9);
  const red = band(0, 1) + band(10, 11);
  if (blue >= 0.16 && blue > red * 1.15 && blue >= green) return "blue";
  if (green >= 0.14 && green > blue * 1.1) return "green";
  if (red >= 0.2 && green >= 0.08) return "multi";
  if (red >= 0.12 && yellow >= 0.05 && (green >= 0.035 || blue >= 0.035)) return "multi";
  if (histogramIsMulti) return "multi";

  return "unknown";
}

/** True when 3+ distinct hue bands are present — typical of panelled bridal lehengas. */
export function histogramIndicatesMulti(hist: number[]): boolean {
  const band = (from: number, to: number) => {
    let s = 0;
    for (let h = from; h <= to; h++) s += hist[h * 3] + hist[h * 3 + 1] + hist[h * 3 + 2];
    return s;
  };
  const red = band(0, 1) + band(10, 11);
  const green = band(2, 4);
  const blue = band(5, 7);
  const yellow = band(8, 9);

  if (green >= 0.12 && green > red * 1.15 && blue < 0.07) return false;
  // Green body with gold zari — not a multi-panel bridal.
  if (green >= 0.1 && green >= red && green >= blue && green >= yellow) return false;

  // Solid blue lehenga — gold zari adds yellow/red traces but blue body dominates.
  if (blue >= 0.13 && blue >= red * 1.2 && blue >= green * 1.15) return false;

  const signals = [red >= 0.07, green >= 0.05, blue >= 0.05, yellow >= 0.04];
  if (signals.filter(Boolean).length >= 3) return true;

  if (red >= 0.12 && yellow >= 0.05 && (green >= 0.035 || blue >= 0.035)) return true;
  return false;
}

export function colorFamilyMatchScore(a: FabricColorFamily, b: FabricColorFamily): number {
  if (a === "unknown" || b === "unknown") return 70;
  if (a === b) return 100;
  if (a === "multi" && b === "multi") return 100;
  if (a === "multi" && (b === "red" || b === "pink" || b === "yellow")) return 45;
  if (b === "multi" && (a === "red" || a === "pink" || a === "yellow")) return 45;
  for (const [x, y] of INCOMPATIBLE_COLOR_FAMILIES) {
    if ((a === x && b === y) || (a === y && b === x)) return 0;
  }
  return 35;
}

export function colorsAreCompatible(a: FabricColorFamily, b: FabricColorFamily): boolean {
  return colorFamilyMatchScore(a, b) >= 50;
}

export async function computeImageFingerprint(buffer: Buffer): Promise<ImageFingerprint> {
  const normalized = await normalizeImageBuffer(buffer);
  let designBuf = normalized;
  try {
    designBuf = await designRegionBuffer(normalized);
  } catch {
    designBuf = normalized;
  }

  const [averageHash, differenceHash, colorHistogram, colorFamily, centrePair, bottomPair, topPair] =
    await Promise.all([
    computeAverageHash(designBuf),
    computeDifferenceHash(designBuf),
    computeColorHistogram(designBuf),
    detectFabricColorFamily(normalized),
    regionDesignHash(normalized, "centre"),
    regionDesignHash(normalized, "bottom"),
    regionDesignHash(normalized, "top"),
  ]);
  return {
    averageHash,
    differenceHash,
    colorHistogram,
    colorFamily,
    centreHash: centrePair,
    bottomHash: bottomPair,
    topHash: topPair,
  };
}

export function hashSimilarity(a: bigint, b: bigint, bits = HASH_BITS): number {
  const xor = a ^ b;
  let diff = 0;
  let x = xor;
  while (x > BigInt(0)) {
    diff += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return Math.round(((bits - diff) / bits) * 1000) / 10;
}

/** Histogram intersection (0–100). Same dress colour reads similarly from different angles. */
export function histogramSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  let intersection = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    intersection += Math.min(a[i], b[i]);
  }
  return Math.round(intersection * 1000) / 10;
}

/** Circular hue-centroid similarity (0–100). Separates green vs blue even when gold thread overlaps. */
export function hueCentroidSimilarity(a: number[], b: number[]): number {
  const centroid = (hist: number[]) => {
    let x = 0;
    let y = 0;
    let total = 0;
    for (let h = 0; h < 12; h++) {
      const mass = hist[h * 3] + hist[h * 3 + 1] + hist[h * 3 + 2];
      const angle = (h / 12) * 2 * Math.PI;
      x += Math.cos(angle) * mass;
      y += Math.sin(angle) * mass;
      total += mass;
    }
    if (total <= 0) return null;
    const cx = x / total;
    const cy = y / total;
    if (cx === 0 && cy === 0) return null;
    return Math.atan2(cy, cx);
  };

  const ha = centroid(a);
  const hb = centroid(b);
  if (ha === null || hb === null) return 0;
  let diff = Math.abs(ha - hb);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return Math.round((1 - diff / Math.PI) * 1000) / 10;
}

export type HueMassProfile = {
  red: number;
  green: number;
  blue: number;
  yellow: number;
  warm: number;
  cool: number;
};

export function hueMassProfile(hist: number[]): HueMassProfile {
  const band = (from: number, to: number) => {
    let s = 0;
    for (let h = from; h <= to; h++) s += hist[h * 3] + hist[h * 3 + 1] + hist[h * 3 + 2];
    return s;
  };
  const red = band(0, 1) + band(10, 11);
  const green = band(2, 4);
  const blue = band(5, 7);
  const yellow = band(8, 9);
  const warm = red + yellow;
  const cool = green + blue;
  return { red, green, blue, yellow, warm, cool };
}

/**
 * Penalty (0–18) when upload hue family clearly disagrees with catalog photo
 * e.g. warm panelled Rajwada upload vs green-dominant Sabesachi catalog shot.
 */
export function warmCoolHueMismatchPenalty(queryHist: number[], storedHist: number[]): number {
  if (!queryHist?.length || !storedHist?.length) return 0;
  const q = hueMassProfile(queryHist);
  const s = hueMassProfile(storedHist);

  const queryWarm = q.warm > q.cool * 1.08 && q.warm >= 0.1;
  const queryGreen = q.green >= 0.11 && q.green > q.warm * 1.12;
  const storedGreen = s.green >= 0.11 && s.green > s.warm * 1.12;
  const storedWarm = s.warm > s.cool * 1.08 && s.warm >= 0.1;

  if (queryWarm && storedGreen) {
    const gap = Math.min(28, Math.round((s.green - q.green) * 80 + (s.green - q.warm) * 50));
    return Math.max(18, gap);
  }
  if (queryGreen && storedWarm) {
    return Math.max(8, Math.min(16, Math.round((q.green - s.green) * 60)));
  }

  const queryIvoryMulti =
    histogramIndicatesMulti(queryHist) && q.warm + q.yellow >= 0.08 && q.green < 0.1;
  if (queryIvoryMulti && storedGreen) {
    return Math.max(20, Math.min(30, Math.round(s.green * 90 + 10)));
  }

  const queryWarmMulti = q.warm >= 0.08 && q.cool < 0.08;
  const storedBlue = s.cool >= 0.12 && s.blue >= 0.1;
  if (queryWarmMulti && storedBlue) {
    return Math.max(12, Math.min(22, Math.round(s.blue * 80 + (s.cool - q.warm) * 30)));
  }

  return 0;
}

/** Overlap of active hue bins — distinguishes multi-panel bridals from solid-colour dresses. */
export function multicolorPanelOverlap(a: number[], b: number[]): number {
  const active = (hist: number[]) => {
    const bins: number[] = [];
    for (let h = 0; h < 12; h++) {
      const mass = hist[h * 3] + hist[h * 3 + 1] + hist[h * 3 + 2];
      if (mass >= 0.035) bins.push(h);
    }
    return bins;
  };
  const ba = active(a);
  const bb = active(b);
  if (!ba.length || !bb.length) return 0;
  let inter = 0;
  for (const h of ba) if (bb.includes(h)) inter++;
  return Math.round((inter / Math.max(ba.length, bb.length)) * 1000) / 10;
}

/** Combined colour score used for ranking and gating. */
export function colorMatchScore(a: ImageFingerprint, b: ImageFingerprint): number {
  const family = colorFamilyMatchScore(a.colorFamily, b.colorFamily);
  if (family === 0) return 0;

  const hist = histogramSimilarity(a.colorHistogram, b.colorHistogram);
  const hue = hueCentroidSimilarity(a.colorHistogram, b.colorHistogram);
  let score = Math.round(Math.min(hist, hue) * 0.35 + ((hist + hue) / 2) * 0.65);

  if (a.colorFamily === "multi" && b.colorFamily === "multi") {
    const panel = multicolorPanelOverlap(a.colorHistogram, b.colorHistogram);
    score = Math.round(score * 0.45 + panel * 0.55);
  }

  return Math.round(Math.min(score, family));
}

async function regionDesignHash(
  normalized: Buffer,
  position: "centre" | "bottom" | "top",
): Promise<{ averageHash: bigint; differenceHash: bigint }> {
  const crop = await sharp(normalized)
    .resize(96, 96, { fit: "cover", position })
    .toBuffer();
  const [averageHash, differenceHash] = await Promise.all([
    computeAverageHash(crop),
    computeDifferenceHash(crop),
  ]);
  return { averageHash, differenceHash };
}

function hashPairSimilarity(
  a: { averageHash: bigint; differenceHash: bigint },
  b: { averageHash: bigint; differenceHash: bigint },
): number {
  const aHash = hashSimilarity(a.averageHash, b.averageHash);
  const dHash = hashSimilarity(a.differenceHash, b.differenceHash, 64);
  return Math.round(Math.max(aHash, dHash) * 0.45 + ((aHash + dHash) / 2) * 0.55);
}
export function designSimilarity(a: ImageFingerprint, b: ImageFingerprint): number {
  const aHash = hashSimilarity(a.averageHash, b.averageHash);
  const dHash = hashSimilarity(a.differenceHash, b.differenceHash, 64);
  const overall = Math.round(Math.max(aHash, dHash) * 0.45 + ((aHash + dHash) / 2) * 0.55);

  if (a.colorFamily === "multi" && b.colorFamily === "multi") {
    const top =
      a.topHash && b.topHash ? hashPairSimilarity(a.topHash, b.topHash) : overall;
    const centre =
      a.centreHash && b.centreHash ? hashPairSimilarity(a.centreHash, b.centreHash) : overall;
    const bottom =
      a.bottomHash && b.bottomHash ? hashPairSimilarity(a.bottomHash, b.bottomHash) : overall;
    return Math.round(bottom * 0.55 + top * 0.3 + centre * 0.15);
  }

  const regionScores = [overall];
  if (a.centreHash && b.centreHash) regionScores.push(hashPairSimilarity(a.centreHash, b.centreHash));
  if (a.bottomHash && b.bottomHash) regionScores.push(hashPairSimilarity(a.bottomHash, b.bottomHash));
  if (a.topHash && b.topHash) regionScores.push(hashPairSimilarity(a.topHash, b.topHash));

  const best = Math.max(...regionScores);
  const avg = Math.round(regionScores.reduce((s, v) => s + v, 0) / regionScores.length);
  return Math.round(best * 0.65 + avg * 0.35);
}

/** Blend colour + design. Design only dominates when hues already match. */
export function blendVisualSearchScore(colorScore: number, designScore: number): number {
  if (colorScore >= 55) {
    return Math.round(colorScore * 0.15 + designScore * 0.85);
  }
  if (colorScore >= 35) {
    return Math.round(colorScore * 0.55 + designScore * 0.45);
  }
  return Math.round(colorScore * 0.8 + designScore * 0.2);
}

/** Slash scores when pixel colour histograms diverge (e.g. green query vs blue dress). */
export function applyColorGate(score: number, colorScore: number): number {
  if (colorScore >= 55) return score;
  if (colorScore < 22) return Math.round(score * (colorScore / 55));
  const factor = 0.2 + (colorScore / 55) * 0.8;
  return Math.round(score * factor);
}

export function finalPhotoSearchScore(
  aiScore: number,
  visualScore: number,
  colorScore: number,
  designScore = visualScore,
  colorFamilyScore = 100,
  queryFamily: FabricColorFamily = "unknown",
  storedFamily: FabricColorFamily = "unknown",
  panelOverlap = 100,
): number {
  let effectiveQuery = queryFamily;
  if (
    queryFamily !== "multi" &&
    storedFamily === "multi" &&
    designScore >= 48 &&
    panelOverlap >= 38
  ) {
    effectiveQuery = "multi";
  }

  const effectiveFamilyScore =
    effectiveQuery === "multi" && storedFamily === "multi"
      ? 100
      : effectiveQuery !== queryFamily && storedFamily === "multi"
        ? Math.max(colorFamilyScore, 85)
        : colorFamilyScore;

  if (effectiveFamilyScore === 0) {
    return Math.min(12, Math.round(Math.max(aiScore, visualScore) * 0.08));
  }

  if (effectiveQuery === "multi" && storedFamily !== "multi") {
    const capped = Math.round(designScore * 0.4);
    return Math.min(38, capped);
  }

  const singleFamilies: FabricColorFamily[] = ["green", "blue", "red", "pink", "yellow"];
  const sameColorVariant =
    colorScore >= 55 &&
    effectiveFamilyScore === 100 &&
    singleFamilies.includes(effectiveQuery) &&
    effectiveQuery === storedFamily;

  let base: number;
  if (effectiveQuery === "multi" && storedFamily === "multi") {
    // Multi bridal lehengas: decide by design/layout, not warm histogram overlap.
    // Cap colour and panel so a different multi dress with similar gold/red tones
    // cannot outrank the true match on colour alone.
    const cappedColor = Math.min(colorScore, 65);
    const panelCap = Math.min(panelOverlap, designScore + 8);
    base =
      aiScore > 0
        ? Math.round(aiScore * 0.55 + designScore * 0.45)
        : Math.round(cappedColor * 0.05 + designScore * 0.9 + panelCap * 0.05);
  } else if (sameColorVariant) {
    base =
      aiScore > 0
        ? Math.round(aiScore * 0.82 + designScore * 0.18)
        : Math.round(colorScore * 0.08 + designScore * 0.92);
  } else if (
    (effectiveQuery === "multi" || storedFamily === "multi") &&
    effectiveFamilyScore >= 85
  ) {
    base =
      aiScore > 0
        ? Math.round(aiScore * 0.5 + designScore * 0.5)
        : Math.round(colorScore * 0.35 + designScore * 0.65);
  } else if (aiScore > 0) {
    base = Math.round(aiScore * 0.5 + visualScore * 0.5);
  } else {
    base = visualScore;
  }

  const gated = applyColorGate(base, colorScore);
  if (effectiveFamilyScore < 50) {
    return Math.round(gated * (effectiveFamilyScore / 100));
  }
  return gated;
}

export type StoredDesignFingerprint = {
  averageHash: string;
  differenceHash: string;
};

export function serializeDesignFingerprint(fp: ImageFingerprint): StoredDesignFingerprint {
  return {
    averageHash: fp.averageHash.toString(),
    differenceHash: fp.differenceHash.toString(),
  };
}

export function fingerprintFromStored(
  stored: StoredDesignFingerprint,
  colorHistogram: number[] = [],
  colorFamily: FabricColorFamily = "unknown",
): ImageFingerprint {
  return {
    averageHash: BigInt(stored.averageHash),
    differenceHash: BigInt(stored.differenceHash),
    colorHistogram,
    colorFamily,
  };
}

/**
 * Combined visual similarity: structural hashes + colour signature.
 * Colour weighted higher so the same garment matches across angles/lighting.
 */
export function combinedImageSimilarity(a: ImageFingerprint, b: ImageFingerprint): number {
  const aHash = hashSimilarity(a.averageHash, b.averageHash);
  const dHash = hashSimilarity(a.differenceHash, b.differenceHash, 64);
  const color = histogramSimilarity(a.colorHistogram, b.colorHistogram);
  const structural = Math.max(aHash, dHash);
  const combined = structural * 0.4 + color * 0.6;
  return Math.round(combined * 10) / 10;
}

/** Minimum combined score to include in photo-search results. */
export const PHOTO_MATCH_MIN_SCORE = 22;
