import { createHash } from "crypto";
import {
  computeImageFingerprint,
  type ImageFingerprint,
} from "./photoHash";
import { generateImageEmbedding } from "./siglipModel";
import { prepareSiglipMasterImage, extractSiglipCrop, SIGLIP_MODEL_ID, SIGLIP_EMBEDDING_DIM } from "./siglipPreprocess";
import { PREPROCESSING_VERSION } from "./dressCheckerConstants";
import { resolveInventoryColourFamily } from "./inventoryColourSemantics";
import {
  IDENTIFICATION_INDEX_VERSION,
  type IdentificationIndex,
  type RegionEmbeddings,
  type StoredReferenceFingerprint,
  type TextureFingerprint,
  type QueryReferenceFingerprint,
} from "./dressIdentificationTypes";
import {
  REFERENCE_VIEW_SPECS,
  buildQueryViewBuffers,
  extractRegionBuffer,
  type RegionKind,
} from "./dressIdentificationRegions";

const REGION_KINDS: RegionKind[] = ["global", "border", "blouse", "skirt", "embroidery"];

export function computeContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function textureFromFingerprint(fp: ImageFingerprint): TextureFingerprint {
  return {
    averageHash: fp.averageHash.toString(),
    differenceHash: fp.differenceHash.toString(),
    centreHash: fp.centreHash?.averageHash.toString() || "",
    bottomHash: fp.bottomHash?.averageHash.toString() || "",
    topHash: fp.topHash?.averageHash.toString() || "",
  };
}

async function buildRegionEmbeddings(master: Buffer): Promise<RegionEmbeddings> {
  const embeddings: Partial<RegionEmbeddings> = {};
  for (const region of REGION_KINDS) {
    const crop = await extractRegionBuffer(master, region);
    embeddings[region] = await generateImageEmbedding(crop);
  }
  return embeddings as RegionEmbeddings;
}

async function buildStoredReference(
  master: Buffer,
  refId: string,
  label: string,
  inventoryName?: string,
  inventoryColor?: string | null,
): Promise<StoredReferenceFingerprint> {
  const [embeddings, fingerprint] = await Promise.all([
    buildRegionEmbeddings(master),
    computeImageFingerprint(master),
  ]);
  const colorFamily = resolveInventoryColourFamily(
    inventoryName || "",
    fingerprint.colorFamily,
    fingerprint.colorHistogram,
    inventoryColor,
  );
  return {
    refId,
    label,
    embeddings,
    texture: textureFromFingerprint(fingerprint),
    colorHistogram: fingerprint.colorHistogram,
    colorFamily,
  };
}

/** Build cached identification index from one or more photo buffers. */
export async function buildIdentificationIndex(
  buffers: Array<{ buffer: Buffer; refId: string; label: string }>,
  category: string,
  inventoryName = "",
  inventoryColor?: string | null,
): Promise<IdentificationIndex> {
  const primary = buffers[0]?.buffer;
  if (!primary) throw new Error("At least one photo buffer required");

  const references: StoredReferenceFingerprint[] = [];

  if (buffers.length === 1) {
    const master = await prepareSiglipMasterImage(primary);
    for (const spec of REFERENCE_VIEW_SPECS) {
      const viewMaster = await extractSiglipCrop(master, spec);
      references.push(await buildStoredReference(viewMaster, spec.refId, spec.label, inventoryName, inventoryColor));
    }
  } else {
    for (const entry of buffers) {
      const master = await prepareSiglipMasterImage(entry.buffer);
      references.push(await buildStoredReference(master, entry.refId, entry.label, inventoryName, inventoryColor));
    }
  }

  return {
    version: IDENTIFICATION_INDEX_VERSION,
    modelId: SIGLIP_MODEL_ID,
    preprocessingVersion: PREPROCESSING_VERSION,
    embeddingDimension: SIGLIP_EMBEDDING_DIM,
    contentHash: computeContentHash(primary),
    indexedAt: new Date().toISOString(),
    category,
    references,
  };
}

export function parseIdentificationIndex(raw: unknown): IdentificationIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const idx = raw as Partial<IdentificationIndex>;
  if (idx.version !== IDENTIFICATION_INDEX_VERSION) return null;
  if (idx.modelId !== SIGLIP_MODEL_ID) return null;
  if (idx.preprocessingVersion !== PREPROCESSING_VERSION) return null;
  if (!Array.isArray(idx.references) || !idx.references.length) return null;
  if (!idx.contentHash || !idx.indexedAt) return null;
  return idx as IdentificationIndex;
}

export function needsIndexRefresh(
  stored: IdentificationIndex | null,
  contentHash: string,
): boolean {
  if (!stored) return true;
  if (stored.version !== IDENTIFICATION_INDEX_VERSION) return true;
  if (stored.modelId !== SIGLIP_MODEL_ID) return true;
  if (stored.preprocessingVersion !== PREPROCESSING_VERSION) return true;
  return stored.contentHash !== contentHash;
}

/** Build multi-view query fingerprint for identification search. */
export async function buildQueryFingerprints(buffer: Buffer): Promise<QueryReferenceFingerprint[]> {
  const views = await buildQueryViewBuffers(buffer);
  const results: QueryReferenceFingerprint[] = [];

  for (const view of views) {
    const [embeddings, fingerprint] = await Promise.all([
      buildRegionEmbeddings(view.buffer),
      computeImageFingerprint(view.buffer),
    ]);
    results.push({
      source: view.source,
      embeddings,
      texture: textureFromFingerprint(fingerprint),
      colorHistogram: fingerprint.colorHistogram,
      colorFamily: fingerprint.colorFamily,
    });
  }

  return results;
}
