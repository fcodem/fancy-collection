import "server-only";

export {
  SIGLIP_EMBEDDING_DIM,
  cosineSimilarity,
  cosineToPercent,
  mapConfidence,
  type ConfidenceLevel,
} from "./siglipMath";

export {
  generateImageEmbedding,
  generateQueryEmbeddings,
  generateReferenceEmbeddings,
  maxCosineSimilarity,
  normalizeStoredEmbeddings,
  serializeStoredEmbeddings,
  type StoredSiglipEmbedding,
} from "./siglipModel";
