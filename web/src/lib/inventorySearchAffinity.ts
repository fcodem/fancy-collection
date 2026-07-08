import { histogramIndicatesMulti } from "./photoHash";

/** Minimal query shape for style/name affinity scoring. */
export type StyleAffinityQuery = {
  colourFamily: string;
  colourHistogram: number[];
  embroideryDensity: number;
  primaryColour: string;
};

function queryIsGreen(query: StyleAffinityQuery): boolean {
  return (
    query.colourFamily === "green" ||
    query.primaryColour === "pista" ||
    query.primaryColour === "green" ||
    query.primaryColour === "mehndi"
  );
}

/**
 * Style/name affinity for multi-colour bridal uploads and monocolor pista/green uploads.
 */
export function inventoryStyleAffinity(
  inventoryName: string,
  query: StyleAffinityQuery,
  inventoryColor?: string | null,
): number {
  const n = inventoryName.toLowerCase();
  const colorText = (inventoryColor || "").toLowerCase();
  const qMulti =
    query.colourFamily === "multi" || histogramIndicatesMulti(query.colourHistogram);

  if (!qMulti && queryIsGreen(query)) {
    if (n.includes("pista") || colorText.includes("pista") || colorText.includes("green")) return 20;
    if (n.includes("multi") || n.includes("rajwada") || colorText.includes("multi")) return -16;
    if (n.includes("cutdana") || n.includes("sabesachi")) return -12;
    return 0;
  }

  if (!qMulti) return 0;

  const heavyEmbroidery = query.embroideryDensity >= 8;

  if (n.includes("rajwada") && heavyEmbroidery) return 22;
  if (n.includes("rajwada")) return 14;

  if (n.includes("cutdana") && heavyEmbroidery) return -14;
  if ((n.includes("floral ct") || n.includes("floral")) && heavyEmbroidery) return -14;
  if (n.includes("sabesachi") && query.primaryColour !== "green") return -16;

  return 0;
}

export function preferRajwadaTieBreak(aName: string, bName: string): number {
  const aRaj = aName.toLowerCase().includes("rajwada") ? 1 : 0;
  const bRaj = bName.toLowerCase().includes("rajwada") ? 1 : 0;
  return bRaj - aRaj;
}
