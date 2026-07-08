import type { FabricColorFamily } from "./photoHash";
import { histogramIndicatesMulti } from "./photoHash";

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
  if (/\bpink\b|\bmagenta\b|\blavender\b|\bpurple\b|\bfuchsia\b/.test(n)) return "pink";
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
