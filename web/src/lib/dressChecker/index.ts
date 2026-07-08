export {
  searchDressesByPhoto,
  DRESS_CHECKER_ENGINE_VERSION,
  type DressCheckerSearchResult,
  type DressCheckerResultItem,
} from "./search";

export {
  processInventoryAiProfile,
  scheduleInventoryAiProfile,
  rebuildAllAiProfiles,
  rebuildSelectedAiProfiles,
  DRESS_CHECKER_FINGERPRINT_VERSION,
} from "./processInventory";

export { analyzeQueryImage } from "./processQuery";
export { matchGarmentIdentity, buildMatchExplanation } from "./identityMatcher";
export { IDENTITY_WEIGHTS_V5, CONFIDENCE_THRESHOLDS, RETRIEVAL_LIMITS, FINGERPRINT_MATCH_WEIGHTS } from "./constants";
export { buildDressFingerprintSummary, type DressFingerprintSummary } from "./dressFingerprintSummary";
export { checkInventoryDuplicate, type DuplicateCheckResult } from "./duplicateDetection";
export type { StoredIdentityProfile } from "./identityProfile";
export * as ImageProcessingService from "./services/imageProcessingService";
export * as GarmentSegmentationService from "./services/garmentSegmentationService";
export * as FeatureExtractionService from "./services/featureExtractionService";
export * as FingerprintService from "./services/fingerprintService";
export * as EmbeddingService from "./services/embeddingService";
export * as CandidateRetrievalService from "./services/candidateRetrievalService";
export * as RankingService from "./services/rankingService";
export * as ConfidenceService from "./services/confidenceService";
export * as FeedbackService from "./services/feedbackService";
export * as InventoryAiProfileService from "./services/inventoryAiProfileService";
export * as DressCheckerSearchEngine from "./services/searchEngine";
