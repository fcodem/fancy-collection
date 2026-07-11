import { searchGarmentIdentity } from "./identitySearchEngine";
import type { CatalogCandidate, QueryAnalysis, RankedCandidate } from "./types";
import { RETRIEVAL_LIMITS } from "./constants";

function buildMatchExplanation(identity: RankedCandidate["identity"]) {
  const parts: string[] = [];
  if (identity.embroidery >= 65) parts.push(`Embroidery ${identity.embroidery}%`);
  if (identity.border >= 65) parts.push(`Border ${identity.border}%`);
  if (identity.motifs >= 60) parts.push(`Motifs ${identity.motifs}%`);
  if (identity.deepEmbedding >= 65) parts.push(`Visual identity ${identity.deepEmbedding}%`);
  if (identity.keypoints >= 55) parts.push(`Geometry ${identity.keypoints}%`);

  return {
    embroidery: identity.embroidery,
    border: identity.border,
    texture: identity.texture,
    silhouette: identity.silhouette,
    motifs: identity.motifs,
    colour: 0,
    neckline: identity.neckline,
    sleeve: identity.sleeve,
    overall: identity.final,
    summary:
      parts.length > 0
        ? parts.join(" · ")
        : `Identity match ${identity.final}%`,
    bestView: identity.bestQuerySource,
    bestInventoryView: identity.bestRefLabel,
  };
}

/**
 * Stages 2–4 — region embedding recompare, geometric verification, final confidence.
 */
export function rerankCandidates(query: QueryAnalysis, candidates: CatalogCandidate[]): RankedCandidate[] {
  const partial = query.partialView ?? "full";

  const ranked: RankedCandidate[] = candidates.map((c) => {
    const result = searchGarmentIdentity({
      queryViews: query.queryFingerprints,
      queryFingerprint: query.fingerprint,
      inventoryIndex: c.identificationIndex,
      inventoryFingerprint: c.fingerprint,
      partialView: partial,
      queryType: query.queryType,
    });

    const identity = result.identity;
    const explanation = buildMatchExplanation(identity);

    return {
      ...c,
      identity,
      hybrid: {
        visual: identity.deepEmbedding,
        colour: 0,
        embroidery: identity.embroidery,
        border: identity.border,
        texture: identity.texture,
        silhouette: identity.silhouette,
        sleeve: identity.sleeve,
        neckline: identity.neckline,
        final: identity.final,
        weights: identity.weights,
        identity,
      },
      rankReason: result.rejected
        ? `${explanation.summary} · ${result.rejectReason ?? "Geometry rejected"}`
        : explanation.summary,
      explanation,
      best_reference: {
        refId: identity.bestRefId,
        label: identity.bestRefLabel,
        querySource: identity.bestQuerySource,
      },
    };
  });

  ranked.sort((a, b) => b.identity.final - a.identity.final);
  return ranked.slice(0, RETRIEVAL_LIMITS.afterIdentityRerank);
}

export function selectFinalResults(ranked: RankedCandidate[]): RankedCandidate[] {
  return ranked.slice(0, RETRIEVAL_LIMITS.finalResults);
}
