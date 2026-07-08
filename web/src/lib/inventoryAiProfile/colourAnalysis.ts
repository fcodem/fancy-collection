import sharp from "sharp";
import type { RecognitionFingerprint } from "../recognitionFingerprint";
import type { ColourAnalysis } from "./types";

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function colourName(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 25) {
    if (max > 200) return "White";
    if (max < 60) return "Black";
    return "Grey";
  }
  if (r > g + 30 && r > b + 30) return r > 180 ? "Pink" : "Red";
  if (g > r + 20 && g > b + 20) return g > 160 ? "Pista Green" : "Green";
  if (b > r + 20 && b > g + 20) return "Blue";
  if (r > 180 && g > 140 && b < 100) return "Golden";
  if (r > 160 && g > 100 && b > 140) return "Magenta";
  if (r > 140 && g > 100 && b < 80) return "Orange";
  if (r > 100 && g > 80 && b > 120) return "Purple";
  if (r > 120 && g > 100 && b > 80) return "Beige";
  return "Multi";
}

function temperatureFromRgb(r: number, g: number, b: number): ColourAnalysis["colourTemperature"] {
  if (r > b + 25) return "warm";
  if (b > r + 25) return "cool";
  return "neutral";
}

export async function analyseImageColours(buffer: Buffer): Promise<Partial<ColourAnalysis>> {
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLum = 0;
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1] ?? r;
    const b = data[i + 2] ?? r;
    sumR += r;
    sumG += g;
    sumB += b;
    sumLum += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const avgR = sumR / pixels;
  const avgG = sumG / pixels;
  const avgB = sumB / pixels;
  const brightness = Math.round((sumLum / pixels / 255) * 100);

  let variance = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const lum = 0.299 * data[i] + 0.587 * (data[i + 1] ?? data[i]) + 0.114 * (data[i + 2] ?? data[i]);
    variance += (lum - sumLum / pixels) ** 2;
  }
  const std = Math.sqrt(variance / pixels);
  const contrastLevel: ColourAnalysis["contrastLevel"] =
    std > 55 ? "high" : std > 30 ? "medium" : "low";

  return {
    brightness,
    contrastLevel,
    colourTemperature: temperatureFromRgb(avgR, avgG, avgB),
  };
}

export function buildColourAnalysis(
  fingerprint: RecognitionFingerprint | null,
  imageHints: Partial<ColourAnalysis> = {},
  visionHints: Partial<ColourAnalysis> = {},
): ColourAnalysis {
  const dominant = fingerprint?.dominantColors ?? [];
  const palette = dominant.slice(0, 5).map((c) => ({
    name: colourName(c.r, c.g, c.b),
    hex: rgbToHex(c.r, c.g, c.b),
    percentage: Math.round(c.weight * 1000) / 10,
  }));

  const primary =
    visionHints.primary ||
    palette[0]?.name ||
    (fingerprint?.colorFamily ? fingerprint.colorFamily.charAt(0).toUpperCase() + fingerprint.colorFamily.slice(1) : "Unknown");

  const secondary = visionHints.secondary || palette[1]?.name || "None";
  const accents = visionHints.accents?.length
    ? visionHints.accents
    : palette.slice(2).map((p) => p.name).filter((n) => n !== primary && n !== secondary);

  return {
    primary,
    secondary,
    accents,
    palette,
    dominantPercentage: palette[0]?.percentage ?? 0,
    contrastLevel: imageHints.contrastLevel ?? visionHints.contrastLevel ?? "medium",
    brightness: imageHints.brightness ?? visionHints.brightness ?? 50,
    colourTemperature: imageHints.colourTemperature ?? visionHints.colourTemperature ?? "neutral",
  };
}
