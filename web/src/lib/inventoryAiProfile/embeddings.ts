import type { RecognitionFingerprint } from "../recognitionFingerprint";
import type { ProfileEmbeddings } from "./types";
import { IDENTIFICATION_INDEX_VERSION } from "../dressIdentificationTypes";
import { SIGLIP_MODEL_ID, SIGLIP_EMBEDDING_DIM } from "../siglipPreprocess";
import { parseIdentificationIndex } from "../dressIdentificationIndex";

type ItemEmbeddingSource = {
  identificationIndex: unknown;
  siglipEmbedding: unknown;
  recognitionFingerprint: unknown;
};

/** Build model-agnostic embedding snapshot from existing pipeline outputs. */
export function snapshotEmbeddings(item: ItemEmbeddingSource): ProfileEmbeddings {
  const embeddings: ProfileEmbeddings = {};
  const index = parseIdentificationIndex(item.identificationIndex);
  const model = SIGLIP_MODEL_ID;
  const modelVersion = String(IDENTIFICATION_INDEX_VERSION);

  if (index?.references?.length) {
    const ref = index.references[0];
    const slot = (region: string, vector: number[]) => ({
      model,
      modelVersion,
      dimension: vector.length || SIGLIP_EMBEDDING_DIM,
      vector,
      region,
    });
    if (ref.embeddings.global?.length) embeddings.global = slot("global", ref.embeddings.global);
    if (ref.embeddings.border?.length) embeddings.border = slot("border", ref.embeddings.border);
    if (ref.embeddings.embroidery?.length) embeddings.embroidery = slot("embroidery", ref.embeddings.embroidery);
    if (ref.embeddings.blouse?.length) {
      embeddings.blouse = slot("blouse", ref.embeddings.blouse);
      embeddings.neckline = slot("neckline", ref.embeddings.blouse);
      embeddings.sleeve = slot("sleeve", ref.embeddings.blouse);
    }
    if (ref.embeddings.skirt?.length) {
      embeddings.skirt = slot("skirt", ref.embeddings.skirt);
      embeddings.shape = slot("shape", ref.embeddings.skirt);
      embeddings.dupatta = slot("dupatta", ref.embeddings.skirt);
    }
    if (ref.texture) {
      const tex = [
        ...ref.texture.averageHash.split("").map((c) => c.charCodeAt(0) % 100 / 100),
        ...ref.texture.differenceHash.split("").map((c) => c.charCodeAt(0) % 100 / 100),
      ];
      embeddings.texture = { model: "hash", modelVersion: "1", dimension: tex.length, vector: tex, region: "texture" };
      embeddings.fineDetail = { model: "hash", modelVersion: "1", dimension: tex.length, vector: tex, region: "fineDetail" };
    }
    if (ref.colorHistogram?.length) {
      embeddings.colour = {
        model: "histogram",
        modelVersion: "1",
        dimension: ref.colorHistogram.length,
        vector: ref.colorHistogram,
        region: "colour",
      };
    }
  }

  const siglip = item.siglipEmbedding as { vector?: number[] } | number[] | null;
  const siglipVec = Array.isArray(siglip) ? siglip : siglip?.vector;
  if (siglipVec?.length && !embeddings.global) {
    embeddings.global = {
      model,
      modelVersion,
      dimension: siglipVec.length,
      vector: siglipVec,
      region: "global",
    };
  }

  const fp = item.recognitionFingerprint as RecognitionFingerprint | null;
  if (fp?.textureDescriptor?.length && !embeddings.texture) {
    embeddings.texture = {
      model: "recognition",
      modelVersion: "1",
      dimension: fp.textureDescriptor.length,
      vector: fp.textureDescriptor,
      region: "texture",
    };
  }

  return embeddings;
}
