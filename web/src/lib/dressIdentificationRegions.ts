import {
  prepareSiglipMasterImage,
  extractSiglipCrop,
  type CropSpec,
} from "./siglipPreprocess";

/**
 * Cross-view bridal region crops.
 * full=global, panel=skirt, plus dupatta + silhouette for hanger/mannequin/worn invariance.
 */
export type RegionKind =
  | "global"
  | "border"
  | "blouse"
  | "skirt"
  | "embroidery"
  | "motif"
  | "dupatta"
  | "silhouette";

export type ReferenceViewSpec = CropSpec & {
  refId: string;
  label: string;
};

/** Virtual reference viewpoints — hanger / mannequin / folded / detail proxies from one photo. */
export const REFERENCE_VIEW_SPECS: ReferenceViewSpec[] = [
  { refId: "full", label: "full", wRatio: 1, hRatio: 1, leftRatio: 0, topRatio: 0 },
  { refId: "body", label: "body", wRatio: 0.74, hRatio: 0.86, leftRatio: 0.13, topRatio: 0.08 },
  { refId: "border", label: "border_closeup", wRatio: 0.74, hRatio: 0.4, leftRatio: 0.13, topRatio: 0.52 },
  { refId: "blouse", label: "blouse", wRatio: 0.58, hRatio: 0.46, leftRatio: 0.21, topRatio: 0.14 },
  { refId: "lower_skirt", label: "lower_skirt", wRatio: 0.74, hRatio: 0.55, leftRatio: 0.13, topRatio: 0.35 },
  { refId: "skirt_panel", label: "skirt_panel", wRatio: 0.74, hRatio: 0.55, leftRatio: 0.13, topRatio: 0.35 },
  { refId: "embroidery", label: "embroidery_detail", wRatio: 0.42, hRatio: 0.42, leftRatio: 0.29, topRatio: 0.3 },
  { refId: "motif", label: "motif_detail", wRatio: 0.36, hRatio: 0.36, leftRatio: 0.32, topRatio: 0.34 },
  { refId: "dupatta", label: "dupatta_drape", wRatio: 0.7, hRatio: 0.35, leftRatio: 0.15, topRatio: 0.05 },
  { refId: "silhouette", label: "silhouette", wRatio: 0.55, hRatio: 0.92, leftRatio: 0.225, topRatio: 0.04 },
  { refId: "detail", label: "detail", wRatio: 0.4, hRatio: 0.4, leftRatio: 0.3, topRatio: 0.28 },
];

const REGION_CROPS: Record<Exclude<RegionKind, "global">, CropSpec> = {
  border: { wRatio: 0.8, hRatio: 0.28, leftRatio: 0.1, topRatio: 0.62 },
  blouse: { wRatio: 0.65, hRatio: 0.38, leftRatio: 0.175, topRatio: 0.1 },
  skirt: { wRatio: 0.78, hRatio: 0.52, leftRatio: 0.11, topRatio: 0.38 },
  embroidery: { wRatio: 0.45, hRatio: 0.45, leftRatio: 0.275, topRatio: 0.28 },
  motif: { wRatio: 0.38, hRatio: 0.38, leftRatio: 0.31, topRatio: 0.32 },
  /** Upper drape / shoulder — dupatta placement must not dominate identity */
  dupatta: { wRatio: 0.72, hRatio: 0.32, leftRatio: 0.14, topRatio: 0.04 },
  /** Narrow full-height crop — shape without background clutter */
  silhouette: { wRatio: 0.52, hRatio: 0.94, leftRatio: 0.24, topRatio: 0.03 },
};

export async function extractRegionBuffer(master: Buffer, region: RegionKind): Promise<Buffer> {
  if (region === "global") return master;
  return extractSiglipCrop(master, REGION_CROPS[region]);
}

export async function extractReferenceViewBuffer(
  buffer: Buffer,
  spec: ReferenceViewSpec,
): Promise<Buffer> {
  const master = await prepareSiglipMasterImage(buffer);
  return extractSiglipCrop(master, spec);
}

export async function buildQueryViewBuffers(buffer: Buffer): Promise<Array<{ source: string; buffer: Buffer }>> {
  const { querySearchVariants } = await import("./photoHash");
  const master = await prepareSiglipMasterImage(buffer);
  const variants = await querySearchVariants(master);
  const views: Array<{ source: string; buffer: Buffer }> = [{ source: "full", buffer: master }];
  const labels = ["centre", "northwest", "left", "south", "north", "wide_left"];
  variants.forEach((v, i) => {
    views.push({ source: labels[i] || `crop_${i}`, buffer: v });
  });
  return views;
}
