import type { RecognitionFingerprint } from "../recognitionFingerprint";
import type { DuplicateFingerprint, ProfileEmbeddings } from "./types";

export function buildDuplicateFingerprint(
  recognitionFp: RecognitionFingerprint | null,
  embeddings: ProfileEmbeddings,
): DuplicateFingerprint | null {
  if (!recognitionFp) return null;

  const globalVec = embeddings.global?.vector ?? embeddings.fineDetail?.vector ?? [];
  const shapeSig = [
    recognitionFp.regionHashes.centre.aHash,
    recognitionFp.regionHashes.bottom.aHash,
    recognitionFp.regionHashes.top.aHash,
  ].join(":");

  return {
    version: 1,
    visualEmbeddingRef: globalVec.length ? `siglip:${globalVec.length}` : "none",
    colourHistogram: recognitionFp.colorHistogram,
    textureFeatures: recognitionFp.textureDescriptor,
    localKeypoints: recognitionFp.localKeypoints,
    fineDetailEmbedding: embeddings.fineDetail?.vector,
    shapeSignature: shapeSig,
    averageHash: recognitionFp.averageHash,
    differenceHash: recognitionFp.differenceHash,
  };
}
