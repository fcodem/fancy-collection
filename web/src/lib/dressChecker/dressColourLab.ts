/**
 * Dress-region colour extraction in CIELAB.
 * Ignores floor/background; classifies muted pinks (dusty/onion/rose/mauve/blush) as pink.
 */
import sharp from "sharp";
import type { FabricColorFamily } from "../photoHash";

export type DetectedColourSwatch = {
  name: string;
  family: FabricColorFamily;
  percentage: number;
  lab: { L: number; a: number; b: number };
  rgb: { r: number; g: number; b: number };
};

export type DressColourDiagnostics = {
  detectedColours: DetectedColourSwatch[];
  dominantPercentages: Record<string, number>;
  finalColourFamily: FabricColorFamily;
  primaryColour: string;
  secondaryColour: string;
  accentColours: string[];
  maskPixelCount: number;
  totalPixelCount: number;
  maskCoverage: number;
  confidence: number;
  lightingReliability: number;
  hsvDiagnostics: {
    averageSaturation: number;
    averageValue: number;
    lowLight: boolean;
    overExposed: boolean;
  };
  method: "lab_dress_mask";
};

export type DressColourResult = {
  primary: string;
  secondary: string;
  accents: string[];
  histogram: number[];
  family: FabricColorFamily;
  diagnostics: DressColourDiagnostics;
};

type LabPixel = { L: number; a: number; b: number; r: number; g: number; bRgb: number };

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  x /= 0.95047;
  y /= 1;
  z /= 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labDistance(a: { L: number; a: number; b: number }, b: { L: number; a: number; b: number }): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

function chroma(lab: { a: number; b: number }): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b);
}

/** Map LAB fabric colour → named swatch + family (muted pinks → pink). */
export function classifyLabColour(lab: { L: number; a: number; b: number }): {
  name: string;
  family: FabricColorFamily;
} {
  const C = chroma(lab);
  const { L, a, b } = lab;

  // Near-neutral / metal / background leftovers
  // Keep slightly warm-grey fabric (a*>4) out of pure neutral — often dusty pink
  if (C < 5.5 && a <= 4) {
    if (L > 82) return { name: "ivory", family: "neutral" };
    if (L < 22) return { name: "black", family: "neutral" };
    return { name: "grey", family: "neutral" };
  }

  // Gold / yellow embroidery (high b*, moderate a*)
  if (b > 28 && a > -5 && a < 35 && L > 45) {
    return { name: "gold", family: "yellow" };
  }

  // Pink family — includes dusty / onion / rose / mauve / blush
  // a* positive (magenta-red), b* not strongly yellow
  const isPinkish =
    a > 4.5 &&
    a < 55 &&
    b > -22 &&
    b < 30 &&
    L > 28 &&
    L < 90 &&
    C >= 5.5;

  if (isPinkish) {
    // Darker muted bridal pinks (onion / dusty) — common in catalog photos
    if (L < 55 && C < 22 && a < 22 && b < 16) {
      return { name: L < 42 ? "onion pink" : "dusty pink", family: "pink" };
    }
    if (L >= 62 && C < 22 && b < 12) return { name: "dusty pink", family: "pink" };
    if (L >= 55 && C < 28 && a > 8 && b < 18) return { name: "onion pink", family: "pink" };
    if (L >= 58 && a > 18 && b > 2 && b < 22) return { name: "rose pink", family: "pink" };
    if (L >= 40 && L < 70 && a > 6 && b < 6 && C < 28) return { name: "mauve", family: "pink" };
    if (L >= 68 && C < 26 && a > 6) return { name: "blush pink", family: "pink" };
    if (a > 28 && C > 30) return { name: "hot pink", family: "pink" };
    return { name: "pink", family: "pink" };
  }

  // Red / maroon
  if (a > 20 && b > 8 && L < 55 && C > 18) {
    return { name: L < 35 ? "maroon" : "red", family: "red" };
  }

  // Blue / navy
  if (b < -8 && a < 15 && (a > -25 || b < -20)) {
    if (L < 40 && C < 35) return { name: "navy", family: "blue" };
    return { name: "blue", family: "blue" };
  }

  // Green / pista
  if (a < -8 && b > 5) {
    return { name: L > 50 && C < 35 ? "pista" : "green", family: "green" };
  }

  // Yellow / peach / coral
  if (b > 20 && a > 5 && a < 45) {
    if (a > 18 && L > 55) return { name: "peach", family: "yellow" };
    return { name: "yellow", family: "yellow" };
  }

  // Purple
  if (a > 10 && b < -8 && L > 25 && L < 70) {
    return { name: "purple", family: "pink" };
  }

  if (C < 12) return { name: "grey", family: "neutral" };
  return { name: "multi", family: "multi" };
}

/** Build dress-only mask: drop floor strip + corner-similar background. */
function buildDressMask(
  data: Buffer,
  width: number,
  height: number,
): { mask: Uint8Array; pixels: LabPixel[] } {
  const mask = new Uint8Array(width * height);
  const pixels: LabPixel[] = [];

  // Corner background LAB average
  const cornerIdx = [
    0,
    (width - 1) * 3,
    (height - 1) * width * 3,
    ((height - 1) * width + (width - 1)) * 3,
  ];
  let cL = 0;
  let cA = 0;
  let cB = 0;
  for (const i of cornerIdx) {
    const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
    cL += lab.L;
    cA += lab.a;
    cB += lab.b;
  }
  const bg = { L: cL / 4, a: cA / 4, b: cB / 4 };

  const floorY0 = Math.floor(height * 0.9); // ignore bottom 10% (floor)
  const cx = width / 2;
  const cy = height * 0.42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lab = rgbToLab(r, g, b);
      const idx = y * width + x;

      if (y >= floorY0) {
        mask[idx] = 0;
        continue;
      }

      const distBg = labDistance(lab, bg);
      const edgeDist =
        Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / Math.sqrt(cx * cx + cy * cy);
      const C = chroma(lab);

      // Keep fabric: different from background OR central + chromatic
      const isDress =
        (distBg > 14 && C >= 5) ||
        (edgeDist < 0.55 && C >= 7 && lab.L > 18 && lab.L < 92) ||
        (distBg > 22 && lab.L > 20 && lab.L < 90);

      if (!isDress) {
        mask[idx] = 0;
        continue;
      }

      // Drop pure white/black leftovers
      if (lab.L > 94 || lab.L < 8) {
        mask[idx] = 0;
        continue;
      }

      mask[idx] = 1;
      pixels.push({ L: lab.L, a: lab.a, b: lab.b, r, g, bRgb: b });
    }
  }

  return { mask, pixels };
}

function quantizeLabKey(lab: { L: number; a: number; b: number }): string {
  const Lq = Math.round(lab.L / 6) * 6;
  const aq = Math.round(lab.a / 5) * 5;
  const bq = Math.round(lab.b / 5) * 5;
  return `${Lq},${aq},${bq}`;
}

function buildHueSatHistogram(pixels: LabPixel[]): number[] {
  const hist = new Array<number>(36).fill(0);
  for (const p of pixels) {
    const C = chroma(p);
    if (C < 5) continue;
    // Approximate hue from a/b
    let h = (Math.atan2(p.b, p.a) / (Math.PI * 2) + 1) % 1;
    const sat = Math.min(1, C / 60);
    const hueBin = Math.min(11, Math.floor(h * 12));
    const satBin = sat < 0.35 ? 0 : sat < 0.65 ? 1 : 2;
    hist[hueBin * 3 + satBin] += 1;
  }
  const total = hist.reduce((s, v) => s + v, 0) || 1;
  return hist.map((v) => v / total);
}

function rgbToHsv(r: number, g: number, b: number): { s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  return { s: max === 0 ? 0 : delta / max, v: max };
}

function colourReliability(sample: LabPixel[], coverage: number, swatches: DetectedColourSwatch[]) {
  if (!sample.length) {
    return {
      confidence: 0,
      lightingReliability: 0,
      hsvDiagnostics: { averageSaturation: 0, averageValue: 0, lowLight: true, overExposed: false },
    };
  }
  let sat = 0;
  let val = 0;
  let lSum = 0;
  for (const p of sample) {
    const hsv = rgbToHsv(p.r, p.g, p.bRgb);
    sat += hsv.s;
    val += hsv.v;
    lSum += p.L;
  }
  const averageSaturation = sat / sample.length;
  const averageValue = val / sample.length;
  const avgL = lSum / sample.length;
  const lowLight = averageValue < 0.22 || avgL < 24;
  const overExposed = averageValue > 0.92 || avgL > 88;
  const topPct = swatches[0]?.percentage ?? 0;
  const coverageScore = Math.min(1, coverage / 35);
  const dominanceScore = Math.min(1, topPct / 35);
  const lightingReliability = lowLight || overExposed ? 0.45 : Math.min(1, 0.6 + averageSaturation * 0.5);
  const confidence = Math.max(0, Math.min(1, coverageScore * 0.45 + dominanceScore * 0.35 + lightingReliability * 0.2));
  return {
    confidence: Math.round(confidence * 100) / 100,
    lightingReliability: Math.round(lightingReliability * 100) / 100,
    hsvDiagnostics: {
      averageSaturation: Math.round(averageSaturation * 100) / 100,
      averageValue: Math.round(averageValue * 100) / 100,
      lowLight,
      overExposed,
    },
  };
}

function decideFamily(
  swatches: DetectedColourSwatch[],
): FabricColorFamily {
  const fabric = swatches.filter((s) => s.family !== "neutral" && s.name !== "gold");
  if (!fabric.length) {
    return swatches[0]?.family ?? "unknown";
  }

  const byFamily = new Map<FabricColorFamily, number>();
  for (const s of fabric) {
    byFamily.set(s.family, (byFamily.get(s.family) ?? 0) + s.percentage);
  }

  const ranked = [...byFamily.entries()].sort((a, b) => b[1] - a[1]);
  const [topFamily, topPct] = ranked[0];
  const secondPct = ranked[1]?.[1] ?? 0;

  // Multi only when two chromatic families both substantial
  if (topPct < 55 && secondPct >= 22 && ranked[1][0] !== "neutral") {
    return "multi";
  }
  return topFamily;
}

/**
 * Extract dominant colours from the dress mask only, using LAB clustering.
 */
export async function extractDressColoursLab(buffer: Buffer): Promise<DressColourResult> {
  const resized = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(160, 200, { fit: "inside", withoutEnlargement: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  const width = info.width ?? 160;
  const height = info.height ?? 200;
  const totalPixelCount = width * height;

  const { pixels } = buildDressMask(data, width, height);
  const maskPixelCount = pixels.length;

  // Fallback: if mask too small, use central body crop
  let sample = pixels;
  if (sample.length < Math.max(80, totalPixelCount * 0.04)) {
    sample = [];
    const x0 = Math.floor(width * 0.2);
    const x1 = Math.floor(width * 0.8);
    const y0 = Math.floor(height * 0.15);
    const y1 = Math.floor(height * 0.75);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 3;
        const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
        if (lab.L > 12 && lab.L < 94) {
          sample.push({ L: lab.L, a: lab.a, b: lab.b, r: data[i], g: data[i + 1], bRgb: data[i + 2] });
        }
      }
    }
  }

  const buckets = new Map<
    string,
    { L: number; a: number; b: number; r: number; g: number; bRgb: number; n: number }
  >();

  for (const p of sample) {
    // Down-weight gold embroidery so fabric body wins
    const cls = classifyLabColour(p);
    const weight = cls.name === "gold" ? 0.35 : cls.family === "neutral" ? 0.5 : 1;
    const key = quantizeLabKey(p);
    const e = buckets.get(key);
    if (e) {
      e.L += p.L * weight;
      e.a += p.a * weight;
      e.b += p.b * weight;
      e.r += p.r * weight;
      e.g += p.g * weight;
      e.bRgb += p.bRgb * weight;
      e.n += weight;
    } else {
      buckets.set(key, {
        L: p.L * weight,
        a: p.a * weight,
        b: p.b * weight,
        r: p.r * weight,
        g: p.g * weight,
        bRgb: p.bRgb * weight,
        n: weight,
      });
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const totalWeight = sorted.reduce((s, v) => s + v.n, 0) || 1;

  const swatches: DetectedColourSwatch[] = sorted.slice(0, 6).map((bucket) => {
    const lab = {
      L: bucket.L / bucket.n,
      a: bucket.a / bucket.n,
      b: bucket.b / bucket.n,
    };
    const { name, family } = classifyLabColour(lab);
    return {
      name,
      family,
      percentage: Math.round((bucket.n / totalWeight) * 1000) / 10,
      lab: {
        L: Math.round(lab.L * 10) / 10,
        a: Math.round(lab.a * 10) / 10,
        b: Math.round(lab.b * 10) / 10,
      },
      rgb: {
        r: Math.round(bucket.r / bucket.n),
        g: Math.round(bucket.g / bucket.n),
        b: Math.round(bucket.bRgb / bucket.n),
      },
    };
  });

  // Prefer chromatic fabric swatches for primary; merge by colour name
  const mergedByName = new Map<string, DetectedColourSwatch>();
  for (const s of swatches) {
    const prev = mergedByName.get(s.name);
    if (prev) {
      prev.percentage = Math.round((prev.percentage + s.percentage) * 10) / 10;
    } else {
      mergedByName.set(s.name, { ...s });
    }
  }
  const merged = [...mergedByName.values()].sort((a, b) => b.percentage - a.percentage);

  const fabricSwatches = merged.filter(
    (s) => s.family !== "neutral" && s.name !== "gold",
  );
  const primarySwatch = fabricSwatches[0] ?? merged[0];
  const secondarySwatch =
    fabricSwatches.find((s) => s.name !== primarySwatch?.name) ??
    merged.find((s) => s.name !== primarySwatch?.name) ??
    primarySwatch;

  const family = decideFamily(merged.length ? merged : swatches);
  const primary = primarySwatch?.name ?? "unknown";
  const secondary = secondarySwatch?.name ?? primary;
  const accents = merged
    .slice(0, 5)
    .map((s) => s.name)
    .filter((n) => n !== primary && n !== secondary);

  const dominantPercentages: Record<string, number> = {};
  for (const s of merged) {
    dominantPercentages[s.name] = s.percentage;
  }

  // If pink family wins but primary was mislabeled grey, force pink name
  let finalPrimary = primary;
  let finalFamily = family;
  if (family === "pink" && (primary === "grey" || primary === "multi" || primary === "ivory")) {
    finalPrimary = fabricSwatches.find((s) => s.family === "pink")?.name ?? "dusty pink";
  }
  if (finalFamily === "multi") {
    const pinkPct = merged.filter((s) => s.family === "pink").reduce((s, x) => s + x.percentage, 0);
    if (pinkPct >= 35) {
      finalFamily = "pink";
      if (!/pink|mauve/i.test(finalPrimary)) {
        finalPrimary = merged.find((s) => s.family === "pink")?.name ?? "dusty pink";
      }
    }
  }

  const coverage = Math.round((sample.length / totalPixelCount) * 1000) / 10;
  const reliability = colourReliability(sample, coverage, merged);
  const diagnostics: DressColourDiagnostics = {
    detectedColours: merged.slice(0, 6),
    dominantPercentages,
    finalColourFamily: finalFamily,
    primaryColour: finalPrimary,
    secondaryColour: secondary,
    accentColours: accents,
    maskPixelCount: sample.length,
    totalPixelCount,
    maskCoverage: coverage,
    confidence: reliability.confidence,
    lightingReliability: reliability.lightingReliability,
    hsvDiagnostics: reliability.hsvDiagnostics,
    method: "lab_dress_mask",
  };

  console.log(
    `[dress-colour] family=${finalFamily} primary=${finalPrimary} confidence=${diagnostics.confidence} lighting=${diagnostics.lightingReliability} coverage=${diagnostics.maskCoverage}% top=${merged
      .slice(0, 3)
      .map((s) => `${s.name}:${s.percentage}%`)
      .join(",")}`,
  );

  return {
    primary: finalPrimary,
    secondary,
    accents,
    histogram: buildHueSatHistogram(sample),
    family: finalFamily,
    diagnostics,
  };
}

/** Pretty-print diagnostics for logs / API. */
export function formatColourDiagnostics(d: DressColourDiagnostics): string {
  const lines = [
    `Detected colours: ${d.detectedColours.map((c) => `${c.name} (${c.percentage}%)`).join(", ") || "none"}`,
    `Dominant percentages: ${Object.entries(d.dominantPercentages)
      .map(([k, v]) => `${k}=${v}%`)
      .join(", ") || "none"}`,
    `Final colour family: ${d.finalColourFamily}`,
    `Primary: ${d.primaryColour} | Secondary: ${d.secondaryColour}`,
    `Confidence: ${d.confidence} | Lighting reliability: ${d.lightingReliability}`,
    `HSV: sat=${d.hsvDiagnostics.averageSaturation} value=${d.hsvDiagnostics.averageValue} lowLight=${d.hsvDiagnostics.lowLight} overExposed=${d.hsvDiagnostics.overExposed}`,
    `Mask coverage: ${d.maskCoverage}% (${d.maskPixelCount}/${d.totalPixelCount})`,
  ];
  return lines.join("\n");
}
