import {
  prepareSiglipMasterImage,
  extractSiglipCrop,
  type CropSpec,
} from "./siglipPreprocess";

export type RegionKind = "global" | "border" | "blouse" | "skirt" | "embroidery";

export type ReferenceViewSpec = CropSpec & {
  refId: string;
  label: string;
};

/** Virtual reference viewpoints generated from a single inventory photo. */
export const REFERENCE_VIEW_SPECS: ReferenceViewSpec[] = [
  { refId: "full", label: "full", wRatio: 1, hRatio: 1, leftRatio: 0, topRatio: 0 },
  { refId: "body", label: "body", wRatio: 0.74, hRatio: 0.86, leftRatio: 0.13, topRatio: 0.08 },
  { refId: "border", label: "border_closeup", wRatio: 0.74, hRatio: 0.4, leftRatio: 0.13, topRatio: 0.52 },
  { refId: "blouse", label: "blouse", wRatio: 0.58, hRatio: 0.46, leftRatio: 0.21, topRatio: 0.14 },
  { refId: "skirt", label: "skirt_panel", wRatio: 0.74, hRatio: 0.55, leftRatio: 0.13, topRatio: 0.35 },
  { refId: "embroidery", label: "embroidery_detail", wRatio: 0.42, hRatio: 0.42, leftRatio: 0.29, topRatio: 0.3 },
];

const REGION_CROPS: Record<Exclude<RegionKind, "global">, CropSpec> = {
  border: { wRatio: 0.8, hRatio: 0.28, leftRatio: 0.1, topRatio: 0.62 },
  blouse: { wRatio: 0.65, hRatio: 0.38, leftRatio: 0.175, topRatio: 0.1 },
  skirt: { wRatio: 0.78, hRatio: 0.52, leftRatio: 0.11, topRatio: 0.38 },
  embroidery: { wRatio: 0.45, hRatio: 0.45, leftRatio: 0.275, topRatio: 0.28 },
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
