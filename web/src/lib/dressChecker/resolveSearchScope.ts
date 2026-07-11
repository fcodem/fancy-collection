import prisma from "@/lib/prisma";
import {
  PGVECTOR_SEARCH_DEFAULT_LIMIT,
  searchInventoryByPgvector,
  type PgvectorSearchResult,
} from "@/lib/ai/pgvector";
import {
  formatSearchScopeLabel,
  voteCategoryFromCandidates,
  type CategorySearchScope,
  type DressSearchMode,
} from "@/lib/dressChecker/categorySearchScope";

export type ResolvedSearchScope = {
  mode: DressSearchMode;
  scope: CategorySearchScope;
  searchScopeLabel: string;
  detectedCategory: string;
  detectedSubCategory: string;
  predictionConfidence: number;
  autoProbeCandidates: number;
};

/**
 * Resolve MANUAL / ALL / AUTO category scope before the main pgvector search.
 * AUTO: probe unfiltered ANN → majority-vote category → filtered search scope.
 */
export async function resolveEnterpriseSearchScope(
  queryEmbedding: number[],
  filters: {
    category?: string;
    subCategory?: string;
    mode?: DressSearchMode;
  },
): Promise<ResolvedSearchScope> {
  const requestedMode = (filters.mode || "MANUAL").toUpperCase() as DressSearchMode;
  const manualCategory = (filters.category || "").trim();
  const manualSub = (filters.subCategory || "").trim();

  // Rule: nothing selected → entire inventory (ALL).
  if (requestedMode === "ALL" || (requestedMode === "MANUAL" && !manualCategory && !manualSub)) {
    const scope: CategorySearchScope = {};
    return {
      mode: "ALL",
      scope,
      searchScopeLabel: formatSearchScopeLabel(scope),
      detectedCategory: "",
      detectedSubCategory: "",
      predictionConfidence: 0,
      autoProbeCandidates: 0,
    };
  }

  if (requestedMode === "MANUAL") {
    const scope: CategorySearchScope = {
      category: manualCategory || undefined,
      subCategory: manualSub || undefined,
    };
    return {
      mode: "MANUAL",
      scope,
      searchScopeLabel: formatSearchScopeLabel(scope),
      detectedCategory: "",
      detectedSubCategory: "",
      predictionConfidence: 0,
      autoProbeCandidates: 0,
    };
  }

  // AUTO — predict category from image via unfiltered ANN vote, then filter.
  const probe = await searchInventoryByPgvector(
    queryEmbedding,
    Math.max(PGVECTOR_SEARCH_DEFAULT_LIMIT, 30),
    {},
  );
  if (!probe.ok || !probe.candidates.length) {
    const scope: CategorySearchScope = {};
    return {
      mode: "AUTO",
      scope,
      searchScopeLabel: formatSearchScopeLabel(scope),
      detectedCategory: "",
      detectedSubCategory: "",
      predictionConfidence: 0,
      autoProbeCandidates: 0,
    };
  }

  const itemIds = probe.candidates.map((c) => c.itemId);
  const items = await prisma.clothingItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      category: true,
      subCategory: true,
      aiProfile: { select: { garmentAttributes: true } },
    },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const voteRows = probe.candidates.map((c) => {
    const item = byId.get(c.itemId);
    const ga = item?.aiProfile?.garmentAttributes as Record<string, unknown> | null;
    const styleSub =
      (typeof ga?.subcategory === "string" && ga.subcategory) ||
      (typeof ga?.subCategory === "string" && ga.subCategory) ||
      item?.subCategory ||
      "";
    return {
      category: item?.category || c.category || "",
      subCategory: styleSub || c.subCategory || null,
      similarity: c.similarity,
    };
  });

  const vote = voteCategoryFromCandidates(voteRows);
  const scope: CategorySearchScope = {
    category: vote.category || undefined,
  };

  return {
    mode: "AUTO",
    scope,
    searchScopeLabel: formatSearchScopeLabel(scope),
    detectedCategory: vote.category,
    detectedSubCategory: vote.subCategory,
    predictionConfidence: vote.confidence,
    autoProbeCandidates: probe.candidates.length,
  };
}

export function buildCategoryFilterDiagnostics(
  vectorResult: PgvectorSearchResult,
  candidateHits: number,
) {
  const before =
    "indexedCountBeforeFilter" in vectorResult ? vectorResult.indexedCountBeforeFilter : 0;
  const after =
    "indexedCountAfterFilter" in vectorResult ? vectorResult.indexedCountAfterFilter : 0;
  return {
    candidates_before_filtering: before,
    candidates_after_filtering: candidateHits,
    indexed_before_filtering: before,
    indexed_after_filtering: after,
  };
}
