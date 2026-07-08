/**
 * @deprecated v6 — use identityMatcher / identitySearchEngine directly.
 */
export {
  matchGarmentIdentity as computeHybridScore,
  buildMatchExplanation,
  explainIdentityRank as explainHybridScore,
  IDENTITY_WEIGHTS_V5,
} from "./identityMatcher";
export { IDENTITY_WEIGHTS_V5 as HYBRID_WEIGHTS_V3 } from "./identityMatcher";
