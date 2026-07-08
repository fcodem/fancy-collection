import type { CatalogCandidate, FilterStage, QueryAnalysis } from "./types";
import { RETRIEVAL_LIMITS } from "./constants";
import { stage1GlobalScore } from "./identitySearchEngine";

/**
 * Stage 1 — global embedding cosine search across ALL catalog items.
 * Returns top 20 by identity embedding similarity (no colour filtering).
 */
export function retrieveCandidates(
  query: QueryAnalysis,
  pool: CatalogCandidate[],
): { candidates: CatalogCandidate[]; stages: FilterStage[] } {
  const stages: FilterStage[] = [];

  const scored = pool.map((c) => ({
    ...c,
    embeddingScore: stage1GlobalScore(query.queryFingerprints, c.references),
  }));

  scored.sort((a, b) => b.embeddingScore - a.embeddingScore);

  stages.push({
    stage: 1,
    name: "global_embedding_top20",
    before: pool.length,
    after: Math.min(RETRIEVAL_LIMITS.stage1GlobalTop, scored.length),
  });

  const top = scored.slice(0, RETRIEVAL_LIMITS.stage1GlobalTop);
  return { candidates: top, stages };
}
