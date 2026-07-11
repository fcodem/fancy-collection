import type { RecognitionFingerprint } from "../recognitionFingerprint";
import type { DuplicateFingerprint, ProfileEmbeddings } from "./types";

export function buildDuplicateFingerprint(
  recognitionFp: RecognitionFingerprint | null,
  embeddings: ProfileEmbeddings,
): DuplicateFingerprint | null {
  if (!recognitionFp?.regionHashes) return null;

  const centre = recognitionFp.regionHashes.centre;
  const bottom = recognitionFp.regionHashes.bottom;
  const top = recognitionFp.regionHashes.top;
  const shapeSig = [
    centre?.aHash ?? "",
    bottom?.aHash ?? "",
    top?.aHash ?? "",
  ].join(":");

  const globalVec = embeddings.global?.vector ?? embeddings.fineDetail?.vector ?? [];

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
