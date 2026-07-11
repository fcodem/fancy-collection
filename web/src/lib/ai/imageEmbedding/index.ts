export {
  INVENTORY_EMBEDDING_DIM,
  DEFAULT_EMBEDDING_MODEL_ORDER,
  parseEmbeddingModelOrder,
  type EmbeddingModelTier,
  type ImageEmbeddingResult,
  type StoredEmbeddingMetadata,
  type FailedEmbeddingMetadata,
} from "./constants";

export { generateInventoryImageEmbedding, type EmbeddingAttempt } from "./imageEmbeddingService";

export {
  processInventoryEmbedding,
  scheduleInventoryEmbedding,
  persistInventoryEmbeddingResult,
  markInventoryEmbeddingFailed,
  retryFailedInventoryEmbeddings,
} from "./processInventoryEmbedding";
