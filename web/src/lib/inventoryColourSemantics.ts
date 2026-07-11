import type { FabricColorFamily } from "./photoHash";
import { histogramIndicatesMulti } from "./photoHash";
import type { DressQueryType } from "./dressChecker/queryTypeDetection";
import type { DressColourDiagnostics } from "./dressChecker/dressColourLab";

/** Dress names that are always treated as panelled / multi-colour inventory. */
export function inventoryNameImpliesMulti(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("multi") ||
    n.includes("rajwada") ||
    n.includes("panel") ||
    n.includes("floral ct")
  );
}

/** Single-colour family implied by inventory name or colour field (overrides histogram false multi). */
export function inventoryMetadataColourFamily(
  name: string,
  inventoryColor?: string | null,
): FabricColorFamily | null {
  if (inventoryNameImpliesMulti(name)) return null;
  const fromColor = inventoryColor ? colourWordFamily(inventoryColor) : null;
  if (fromColor) return fromColor;
  return colourWordFamily(name);
}

function colourWordFamily(text: string): FabricColorFamily | null {
  const n = text.toLowerCase();
  if (n.includes("multi") || n.includes("rajwada") || n.includes("panel")) return null;
  if (/\bblue\b|\bnavy\b/.test(n)) return "blue";
  // Dusty / onion / rose / mauve / blush pinks → pink family
  if (
    /\bpink\b|\bonion\b|\bdusty\b|\bblush\b|\bmauve\b|\brose\b|\bmagenta\b|\blavender\b|\bpurple\b|\bfuchsia\b|\bsalmon\b/.test(
      n,
    )
  ) {
    return "pink";
  }
  if (/\bpista\b|\bgreen\b|\bmehendi\b|\bolive\b/.test(n)) return "green";
  if (/\bred\b|\bmaroon\b|\burgundy\b|\bwine\b/.test(n)) return "red";
  if (/\byellow\b|\bgold\b|\bgolden\b|\bmustard\b/.test(n)) return "yellow";
  if (/\bpeach\b|\bcoral\b|\borange\b|\bsaffron\b/.test(n)) return "yellow";
  if (/\bwhite\b|\bivory\b|\bcream\b|\boff[\s-]?white\b|\bblack\b/.test(n)) return "neutral";
  return null;
}

export function resolveInventoryColourFamily(
  name: string,
  detected: FabricColorFamily,
  histogram: number[],
  inventoryColor?: string | null,
): FabricColorFamily {
  if (inventoryNameImpliesMulti(name)) return "multi";
  const metaFamily = inventoryMetadataColourFamily(name, inventoryColor);
  if (metaFamily) return metaFamily;
  if (detected === "multi") return "multi";
  if (histogramIndicatesMulti(histogram)) return "multi";
  return detected;
}

export function isInventoryMultiColor(
  name: string,
  family: FabricColorFamily,
  histogram: number[],
  inventoryColor?: string | null,
): boolean {
  if (inventoryNameImpliesMulti(name)) return true;
  if (inventoryMetadataColourFamily(name, inventoryColor)) return false;
  if (family === "multi") return true;
  return histogramIndicatesMulti(histogram);
}

export function isInventoryMonocolor(
  name: string,
  family: FabricColorFamily,
  histogram: number[],
  inventoryColor?: string | null,
): boolean {
  return !isInventoryMultiColor(name, family, histogram, inventoryColor);
}

/** Chromatic families that must never cross-match (immediate hard reject). */
export const INCOMPATIBLE_COLOUR_FAMILY_PAIRS: ReadonlyArray<
  readonly [FabricColorFamily, FabricColorFamily]
> = [
  ["pink", "blue"],
  ["pink", "green"],
  ["pink", "yellow"],
  ["blue", "green"],
  ["blue", "yellow"],
  ["blue", "red"],
  ["green", "red"],
  ["green", "yellow"],
  ["red", "yellow"],
  ["pink", "red"],
] as const;

/** Pink shade names that are allowed to match each other (all map to family pink). */
export const PINK_VARIANT_NAMES = [
  "pink",
  "dusty pink",
  "onion pink",
  "rose pink",
  "rose",
  "mauve",
  "blush pink",
  "blush",
  "hot pink",
  "magenta",
  "lavender",
  "fuchsia",
  "salmon",
] as const;

export function isPinkColourName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return PINK_VARIANT_NAMES.some((v) => n === v || n.includes(v));
}

function pairKey(a: FabricColorFamily, b: FabricColorFamily): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const INCOMPATIBLE_PAIR_SET = new Set(
  INCOMPATIBLE_COLOUR_FAMILY_PAIRS.map(([a, b]) => pairKey(a, b)),
);

/**
 * True when two colour families are an immediate hard reject
 * (e.g. pink ↔ blue). Pink variants (dusty/rose/mauve/blush) share family "pink"
 * and are always compatible with each other.
 */
export function areColourFamiliesIncompatible(
  queryFamily: FabricColorFamily,
  inventoryFamily: FabricColorFamily,
): boolean {
  if (queryFamily === inventoryFamily) return false;
  if (queryFamily === "unknown" || inventoryFamily === "unknown") return false;
  // Multi/neutral: do not hard-reject here (handled by histogram / name metadata upstream)
  if (queryFamily === "multi" || inventoryFamily === "multi") return false;
  if (queryFamily === "neutral" || inventoryFamily === "neutral") return false;
  return INCOMPATIBLE_PAIR_SET.has(pairKey(queryFamily, inventoryFamily));
}

/** Hard reject when dominant colour families differ (e.g. blue query vs dusty pink inventory). */
export function dominantColorFamiliesMismatch(
  queryFamily: FabricColorFamily,
  inventoryFamily: FabricColorFamily,
): boolean {
  return areColourFamiliesIncompatible(queryFamily, inventoryFamily);
}

export type ColourFamilyRejectResult = {
  rejected: boolean;
  reason?: string;
  queryFamily: FabricColorFamily;
  inventoryFamily: FabricColorFamily;
};

export type AdaptiveColourGateResult = {
  action: "none" | "penalty" | "reject";
  penalty: number;
  reason: string;
  queryFamily: FabricColorFamily;
  inventoryFamily: FabricColorFamily;
  rule: string;
};

/**
 * Pre-rerank colour gate. Prefer inventory name/colour metadata, then stored fingerprint family.
 * Never allows blue (or green/yellow) dresses into a pink search.
 */
export function rejectIncompatibleColourFamily(input: {
  queryFamily: FabricColorFamily;
  inventoryFamily?: FabricColorFamily | null;
  inventoryName?: string | null;
  inventoryColor?: string | null;
}): ColourFamilyRejectResult {
  const meta =
    inventoryMetadataColourFamily(input.inventoryName || "", input.inventoryColor) ?? null;
  const inventoryFamily =
    meta ||
    input.inventoryFamily ||
    ("unknown" as FabricColorFamily);

  const queryFamily = input.queryFamily;

  if (areColourFamiliesIncompatible(queryFamily, inventoryFamily)) {
    return {
      rejected: true,
      reason: `Colour family mismatch (${queryFamily} ↔ ${inventoryFamily})`,
      queryFamily,
      inventoryFamily,
    };
  }

  return {
    rejected: false,
    queryFamily,
    inventoryFamily,
  };
}

function reliableColour(d?: DressColourDiagnostics | null): boolean {
  if (!d) return false;
  return d.confidence >= 0.7 && d.lightingReliability >= 0.7 && d.maskCoverage >= 12;
}

function softQueryType(queryType?: DressQueryType): boolean {
  return (
    queryType === "LOWER_SKIRT" ||
    queryType === "PARTIAL_VIEW" ||
    queryType === "LOW_LIGHT" ||
    queryType === "BLURRY" ||
    queryType === "WHATSAPP_SCREENSHOT"
  );
}

export function adaptiveColourGate(input: {
  queryFamily: FabricColorFamily;
  inventoryFamily?: FabricColorFamily | null;
  inventoryName?: string | null;
  inventoryColor?: string | null;
  queryDiagnostics?: DressColourDiagnostics | null;
  inventoryDiagnostics?: DressColourDiagnostics | null;
  embeddingScore: number;
  queryType?: DressQueryType;
  borderScore?: number;
  motifScore?: number;
  panelScore?: number;
  structuralScore?: number;
}): AdaptiveColourGateResult {
  const base = rejectIncompatibleColourFamily(input);
  if (!base.rejected) {
    return {
      action: "none",
      penalty: 0,
      reason: "colour families compatible or inconclusive",
      queryFamily: base.queryFamily,
      inventoryFamily: base.inventoryFamily,
      rule: "compatible",
    };
  }

  const qReliable = reliableColour(input.queryDiagnostics);
  const iReliable = reliableColour(input.inventoryDiagnostics);
  const structuralStrong =
    (input.structuralScore ?? 0) >= 82 ||
    ((input.borderScore ?? 0) >= 70 && (input.motifScore ?? 0) >= 65) ||
    ((input.borderScore ?? 0) >= 65 && (input.panelScore ?? 0) >= 80);
  const highEmbedding = input.embeddingScore >= 90;
  const partialOrUnreliable = softQueryType(input.queryType) || !qReliable || !iReliable;

  if (highEmbedding || structuralStrong || partialOrUnreliable) {
    const reason = [
      base.reason,
      highEmbedding ? `embedding ${input.embeddingScore.toFixed(1)}>=90` : null,
      structuralStrong ? "strong structural evidence" : null,
      softQueryType(input.queryType) ? `queryType=${input.queryType}` : null,
      !qReliable ? "query colour unreliable" : null,
      !iReliable ? "inventory colour unreliable" : null,
    ]
      .filter(Boolean)
      .join("; ");
    return {
      action: "penalty",
      penalty: structuralStrong || highEmbedding ? 4 : 8,
      reason,
      queryFamily: base.queryFamily,
      inventoryFamily: base.inventoryFamily,
      rule: "colour_penalty_not_reject",
    };
  }

  return {
    action: "reject",
    penalty: 100,
    reason: `${base.reason}; reliable colour on both sides and weak structure`,
    queryFamily: base.queryFamily,
    inventoryFamily: base.inventoryFamily,
    rule: "reliable_incompatible_colour_weak_structure",
  };
}
