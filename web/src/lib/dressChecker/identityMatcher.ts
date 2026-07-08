/**
 * v6 identity matcher — delegates to identitySearchEngine (region embeddings + geometry).
 * Legacy exports preserved for scripts/tests.
 */
import type { IdentificationIndex, QueryReferenceFingerprint } from "../dressIdentificationTypes";
import { FINGERPRINT_MATCH_WEIGHTS } from "./constants";
import { searchGarmentIdentity } from "./identitySearchEngine";
import { stage1GlobalScore } from "./identitySearchEngine";
import type { FeatureFingerprint, IdentityScores, MatchExplanation } from "./types";
import type { PartialViewType } from "./partialViewDetection";

export { FINGERPRINT_MATCH_WEIGHTS as IDENTITY_WEIGHTS_V5 };

export function matchGarmentIdentity(
  queryViews: QueryReferenceFingerprint[],
  queryFeature: FeatureFingerprint,
  inventoryIndex: IdentificationIndex,
  inventoryFeature: FeatureFingerprint | null,
  _inventoryName: string,
  _inventoryColor?: string | null,
  partialView: PartialViewType = "full",
): IdentityScores {
  const result = searchGarmentIdentity({
    queryViews,
    queryFingerprint: queryFeature,
    inventoryIndex,
    inventoryFingerprint: inventoryFeature,
    partialView,
  });
  return result.identity;
}

export function identityToHybrid(identity: IdentityScores) {
  return {
    visual: identity.deepEmbedding,
    colour: identity.colour,
    embroidery: identity.embroidery,
    border: identity.border,
    texture: identity.texture,
    silhouette: identity.silhouette,
    sleeve: identity.sleeve,
    neckline: identity.neckline,
    final: identity.final,
    weights: identity.weights,
    identity,
  };
}

export function buildMatchExplanation(identity: IdentityScores): MatchExplanation {
  const parts: string[] = [];
  if (identity.embroidery >= 65) parts.push(`Embroidery ${identity.embroidery}%`);
  if (identity.border >= 65) parts.push(`Border ${identity.border}%`);
  if (identity.motifs >= 60) parts.push(`Motifs ${identity.motifs}%`);
  if (identity.colour >= 60) parts.push(`Colour ${identity.colour}%`);
  if (identity.texture >= 60) parts.push(`Texture ${identity.texture}%`);
  if (identity.silhouette >= 60) parts.push(`Shape ${identity.silhouette}%`);
  if (identity.deepEmbedding >= 65) parts.push(`Embedding ${identity.deepEmbedding}%`);
  if (identity.keypoints >= 55) parts.push(`Geometry ${identity.keypoints}%`);

  return {
    embroidery: identity.embroidery,
    border: identity.border,
    texture: identity.texture,
    silhouette: identity.silhouette,
    motifs: identity.motifs,
    colour: identity.colour,
    neckline: identity.neckline,
    sleeve: identity.sleeve,
    overall: identity.final,
    summary: parts.length > 0 ? parts.join(" · ") : `Identity ${identity.final}%`,
    bestView: identity.bestQuerySource,
    bestInventoryView: identity.bestRefLabel,
  };
}

export function explainIdentityRank(identity: IdentityScores): string {
  return buildMatchExplanation(identity).summary;
}

export function prefilterEmbeddingScore(
  queryViews: QueryReferenceFingerprint[],
  references: import("../dressIdentificationTypes").StoredReferenceFingerprint[],
): number {
  return stage1GlobalScore(queryViews, references);
}
