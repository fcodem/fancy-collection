/**
 * dressFingerprint.ts
 *
 * Uses OpenAI Vision to extract a structured "visual fingerprint" from a
 * dress photo. The fingerprint captures design elements that are stable
 * across different angles, lighting conditions, and crop levels.
 */

import { normalizeImageBuffer } from "./photoHash";
import { generateVisionMetadataFromOpenAi } from "@/lib/ai/openaiVision";

export interface DressFingerprint {
  style: string;
  primaryColor: string;
  secondaryColor: string;
  embroideryStyle: string;
  embroideryPattern: string;
  borderDesign: string;
  fabric: string;
  distinctiveFeatures: string;
  occasion: string;
  searchText: string;
}

export async function describeDressImage(imageBuffer: Buffer): Promise<DressFingerprint> {
  const processedBuffer = await normalizeImageBuffer(imageBuffer);
  const parsed = await generateVisionMetadataFromOpenAi(processedBuffer, {
    category: "unknown",
    itemType: "clothing",
  });
  const fingerprint: Omit<DressFingerprint, "searchText"> = {
    style: String(parsed.subcategory || parsed.category || "Other"),
    primaryColor: parsed.primaryColours?.[0] || "Unknown",
    secondaryColor: parsed.secondaryColours?.[0] || "None",
    embroideryStyle: String(parsed.embroideryType || "Unknown"),
    embroideryPattern: String(parsed.pattern || "Unknown"),
    borderDesign: String(parsed.borderStyle || "Unknown"),
    fabric: String(parsed.fabric || "Unknown"),
    distinctiveFeatures: String(parsed.visualDescription || ""),
    occasion: String(parsed.occasion || "Festive"),
  };

  const searchText = [
    fingerprint.style,
    fingerprint.primaryColor,
    fingerprint.primaryColor,
    fingerprint.secondaryColor,
    fingerprint.embroideryStyle,
    fingerprint.embroideryPattern,
    fingerprint.embroideryPattern,
    fingerprint.embroideryPattern,
    fingerprint.borderDesign,
    fingerprint.fabric,
    fingerprint.distinctiveFeatures,
    fingerprint.distinctiveFeatures,
    fingerprint.occasion,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return { ...fingerprint, searchText };
}

export function fingerprintSimilarity(a: DressFingerprint, b: DressFingerprint): number {
  const colorSim = colorSimilarity(a.primaryColor, b.primaryColor);

  // Different hues (green vs blue) must never outrank a colour match on pattern alone.
  if (colorSim < 0.2) {
    const patternSim = patternSimilarity(a.embroideryPattern, b.embroideryPattern);
    return Math.round(colorSim * 50 + patternSim * 10);
  }

  const sameColor = colorSim >= 0.85;
  let score = 0;
  let maxScore = 0;

  maxScore += sameColor ? 15 : 35;
  score += colorSim * (sameColor ? 15 : 35);

  maxScore += sameColor ? 50 : 35;
  const patternSim = patternSimilarity(a.embroideryPattern, b.embroideryPattern);
  score += patternSim * (sameColor ? 50 : 35);

  maxScore += 12;
  if (a.embroideryStyle === b.embroideryStyle) score += 12;
  else if (a.embroideryStyle.split(" ")[0] === b.embroideryStyle.split(" ")[0]) score += 6;

  maxScore += 8;
  if (a.style === b.style) score += 8;

  maxScore += 5;
  if (colorSimilarity(a.secondaryColor, b.secondaryColor) > 0.7) score += 5;

  maxScore += 5;
  if (a.fabric === b.fabric) score += 5;

  maxScore += sameColor ? 25 : 15;
  const featureSim = textSimilarity(a.distinctiveFeatures, b.distinctiveFeatures);
  const borderSim = patternSimilarity(a.borderDesign, b.borderDesign);
  score += featureSim * (sameColor ? 15 : 10);
  score += borderSim * (sameColor ? 10 : 5);

  return Math.round((score / maxScore) * 100);
}

function normalizePatternText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bhoney\s*comb\b/g, "hexmesh")
    .replace(/\bhoneycomb\b/g, "hexmesh")
    .replace(/\bhexagonal\b/g, "hexmesh")
    .replace(/\bhex\s*mesh\b/g, "hexmesh")
    .replace(/\bvertical\s+panel/g, "vertpanel")
    .replace(/\bpanelled?\b/g, "panel")
    .replace(/\bjaal\b/g, "jaal")
    .replace(/\ball.over\b/g, "allover")
    .replace(/\bcutdana\b/g, "cutdana")
    .replace(/\barch\b/g, "arch")
    .replace(/\bfan\b/g, "fan")
    .replace(/\bfloral\b/g, "floral");
}

function patternSimilarity(a: string, b: string): number {
  return textSimilarity(normalizePatternText(a), normalizePatternText(b));
}

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokensA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const tokensB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function colorFamilyFromName(color: string): string | null {
  const c = color.toLowerCase();
  if (/\b(blue|navy|cobalt|indigo|azure|sapphire)\b/.test(c)) return "blue";
  if (/\b(green|pista|pistachio|mint|sage|olive|lime|sea\s*green|moss|pista)\b/.test(c)) return "green";
  if (/\b(red|maroon|burgundy|wine|crimson|scarlet)\b/.test(c)) return "red";
  if (/\b(pink|magenta|fuchsia|rose)\b/.test(c)) return "pink";
  if (/\b(teal|turquoise|cyan|aqua)\b/.test(c)) return "teal";
  return null;
}

function colorFamiliesIncompatible(a: string, b: string): boolean {
  const incompatible: [string, string][] = [
    ["green", "blue"],
    ["green", "red"],
    ["blue", "red"],
  ];
  for (const [x, y] of incompatible) {
    if ((a === x && b === y) || (a === y && b === x)) return true;
  }
  return false;
}

function colorSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;

  const fa = colorFamilyFromName(a);
  const fb = colorFamilyFromName(b);
  if (fa && fb && colorFamiliesIncompatible(fa, fb)) return 0;

  const normalize = (c: string) =>
    c
      .toLowerCase()
      .replace(/\bforest\b/g, "dark green")
      .replace(/\bemerald\b/g, "green")
      .replace(/\bpistachio\b/g, "light green")
      .replace(/\bpista\b/g, "light green")
      .replace(/\bmint\b/g, "light green")
      .replace(/\bsage\b/g, "light green")
      .replace(/\bolive\b/g, "light green")
      .replace(/\bdusty\b/g, "")
      .replace(/\bsea\s*green\b/g, "teal green")
      .replace(/\bsikiya\b/g, "light green")
      .replace(/\bjungle\b/g, "dark green")
      .replace(/\bpetrol\b/g, "teal")
      .replace(/\bpine\b/g, "dark green")
      .replace(/\bburgundy\b/g, "dark red")
      .replace(/\bwine\b/g, "dark red")
      .replace(/\bmaroon\b/g, "dark red")
      .replace(/\bmagenta\b/g, "pink")
      .replace(/\bhot pink\b/g, "pink")
      .replace(/\bfuchsia\b/g, "pink")
      .replace(/\bnavy\b/g, "dark blue")
      .replace(/\belectric blue\b/g, "bright blue")
      .replace(/\bkobalt\b/g, "cobalt blue")
      .replace(/\boff.white\b/g, "ivory")
      .replace(/\bcream\b/g, "ivory")
      .replace(/\bbeige\b/g, "ivory")
      .trim();

  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  return textSimilarity(na, nb);
}
