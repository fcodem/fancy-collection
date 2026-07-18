import { readFile } from "fs/promises";
import path from "path";

/**
 * Load the brand logo as a PNG data URL for embedding in jsPDF fallback slips.
 * Cached per lambda; returns null if the asset is unavailable so the caller can
 * fall back to a drawn monogram. Never throws.
 */
let cached: string | null | undefined;

export async function loadSlipLogoDataUrl(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const p = path.join(process.cwd(), "public", "images", "fancy-collection-logo.png");
    const buf = await readFile(p);
    cached = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    cached = null;
  }
  return cached;
}
