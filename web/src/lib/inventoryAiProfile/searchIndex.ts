import type {
  ColourAnalysis,
  GarmentAttributes,
  JewelleryAttributes,
} from "./types";

export function buildSearchText(parts: {
  description?: string | null;
  tags?: string[];
  colourAnalysis?: ColourAnalysis | null;
  garmentAttributes?: GarmentAttributes | null;
  jewelleryAttributes?: JewelleryAttributes | null;
  category?: string;
  name?: string;
}): string {
  const tokens: string[] = [];

  if (parts.name) tokens.push(parts.name);
  if (parts.category) tokens.push(parts.category);
  if (parts.description) tokens.push(parts.description);

  for (const tag of parts.tags || []) tokens.push(tag);

  const c = parts.colourAnalysis;
  if (c) {
    tokens.push(c.primary, c.secondary, ...c.accents);
    for (const p of c.palette) tokens.push(p.name);
  }

  const g = parts.garmentAttributes;
  if (g) {
    for (const v of Object.values(g)) {
      if (typeof v === "string" && v) tokens.push(v);
      if (typeof v === "boolean" && v) tokens.push("yes");
    }
  }

  const j = parts.jewelleryAttributes;
  if (j) {
    for (const v of Object.values(j)) {
      if (typeof v === "string" && v) tokens.push(v);
      if (typeof v === "boolean" && v) tokens.push("yes");
    }
  }

  return [...new Set(tokens.map((t) => t.toLowerCase().trim()).filter((t) => t.length > 1))].join(" ");
}
