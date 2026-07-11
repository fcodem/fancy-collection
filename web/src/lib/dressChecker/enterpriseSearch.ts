/**
 * Dress Checker search — enterprise multi-stage + gated OpenAI forensics.
 *
 * Stage 1: pgvector ANN (top 50)
 * Stage 2: fingerprint filter + learning (top 10) — before expensive region work
 * Stage 3: region / fine-grained rerank (top 5)
 * Stage 4: OpenAI bridal forensic verify (top 3, only if 70–92)
 *
 * OpenAI is never the primary search engine.
 */

import prisma from "@/lib/prisma";

import { catalogPhotoRef } from "@/lib/catalogPhotoRef";

import { dressDisplayName } from "@/lib/dress";

import { loadPhotoBuffer } from "@/lib/services/siglipSearch";

import { generateIndexEmbedding } from "@/lib/dressChecker/indexingService";
import { analyzeQueryImage } from "@/lib/dressChecker/processQuery";
import { rerankPgvectorCandidatesFineGrained } from "@/lib/dressChecker/enterpriseFineGrainedRerank";
import { poolViewInvariantQueryEmbedding } from "@/lib/dressChecker/viewInvariantMatching";

import {

  PGVECTOR_SEARCH_DEFAULT_LIMIT,

  searchInventoryByPgvector,

} from "@/lib/ai/pgvector";
import {
  type DressSearchMode,
} from "@/lib/dressChecker/categorySearchScope";
import {
  buildCategoryFilterDiagnostics,
  resolveEnterpriseSearchScope,
} from "@/lib/dressChecker/resolveSearchScope";

import {

  isVlmAvailable,

  verifyDressIdentity,

  OPENAI_VERIFY_TOP_N,

  OPENAI_VERIFY_CONFIDENCE,

  type VlmCandidate,

} from "@/lib/dressChecker/vlmIdentity";

import {

  classifyVectorFailureCode,

  type DressCheckerIssueCode,

} from "@/lib/dressChecker/searchHealth";

import type { FineGrainedComponentScores } from "@/lib/dressChecker/fineGrainedTypes";
import {
  enterpriseMatchBand,
  enterpriseMatchBandLabel,
  shouldDisplayEnterpriseMatch,
  ENTERPRISE_DISPLAY_THRESHOLDS,
  calibrateEnterpriseGptFusion,
  type ForensicVerdictKind,
} from "@/lib/dressChecker/enterpriseMatchScore";
import { buildDressFingerprintSummary } from "@/lib/dressChecker/dressFingerprintSummary";
import type { QueryAnalysis } from "@/lib/dressChecker/types";
import { mapConfidence } from "@/lib/siglipMath";

function buildQueryDetected(query: QueryAnalysis) {
  const fp = query.fingerprint;
  const summary = buildDressFingerprintSummary(fp);
  const colourLabel = [
    fp.primaryColour,
    fp.colourFamily && fp.colourFamily !== "unknown" ? `(${fp.colourFamily})` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    category: query.category || fp.category || "",
    colours: {
      primary: fp.primaryColour,
      secondary: fp.secondaryColour,
      accents: fp.accentColours ?? [],
      family: fp.colourFamily,
      label: colourLabel,
    },
    motifs: summary.motifs,
    embroideryDensity: fp.embroideryDensity,
    embroideryStyle: fp.embroideryStyle,
    embroideryLabel: summary.embroidery,
  };
}

export class VectorSearchFailure extends Error {

  readonly reason: string;

  readonly code: DressCheckerIssueCode;

  readonly diagnostics: Record<string, unknown>;

  constructor(

    reason: string,

    diagnostics: Record<string, unknown> = {},

    code?: DressCheckerIssueCode,

  ) {

    super(reason);

    this.name = "VectorSearchFailure";

    this.reason = reason;

    this.code =

      code ||

      (typeof diagnostics.failure_code === "string"

        ? (diagnostics.failure_code as DressCheckerIssueCode)

        : classifyVectorFailureCode(

            reason,

            typeof diagnostics.category === "string" ? diagnostics.category : undefined,

          ));

    this.diagnostics = diagnostics;

  }

}

export type EnterpriseSearchFilters = {
  category?: string;
  subCategory?: string;
  /** AUTO = predict from image; MANUAL = use selected; ALL = entire inventory */
  mode?: DressSearchMode;
};

type ScoredCandidate = {

  itemId: number;

  sku: string;

  name: string;

  category: string;

  status: string;

  size: string;

  color: string;

  photo: string;

  dailyRate: number;

  subCategory: string;

  vectorDistance: number;

  embeddingScore: number;

  fineGrainedScore: number;

  identityScore: number | null;

  textureScore: number | null;

  components: FineGrainedComponentScores;

  openAiScore: number;

  finalScore: number;
  reasoning: string;
  rejected: boolean;
  rejectReason?: string;
  bestRefLabel?: string;
};

export type EnterpriseSearchResult = {

  ok: true;

  category: string;

  sub_category?: string;

  search_mode?: DressSearchMode;

  search_scope_label?: string;

  detected_category?: string;

  detected_subcategory?: string;

  offer_search_entire_inventory?: boolean;

  category_filter_diagnostics?: {
    candidates_before_filtering: number;
    candidates_after_filtering: number;
    indexed_before_filtering: number;
    indexed_after_filtering: number;
  };

  search_engine: "pgvector";

  processing_time_ms: number;

  results: Array<{

    id: number;

    name: string;

    display_name: string;

    sku: string;

    category: string;

    status: string;

    size: string;

    color: string;

    photo: string;

    daily_rate: number;

    sub_category: string;

    inventory_location: string;

    similarity: number;

    vector_similarity: number;

    vector_distance: number;

    confidence_band: "exact_match" | "highly_likely" | "possible_match" | "below_threshold";
    confidence_label: string;
    confidence: ReturnType<typeof mapConfidence>;

    rank_reason: string;

    embedding_score?: number;

    fine_grained_score?: number;

    color_score?: number;

    border_score?: number;

    motif_score?: number;

    stone_score?: number;

    panel_score?: number;

    blouse_score?: number;

    dupatta_score?: number;

    openai_score?: number;

    identity_score?: number | null;

    texture_score?: number | null;

    rejected?: boolean;

    reject_reason?: string;

    openai_verification?: {

      sameDress: boolean;

      exactMatch: boolean;

      confidence: number;

      reasoning: string;

      differences?: string[];

      reasons?: string[];

    };

    fine_grained_reasons?: string[];

  }>;

  category_results: EnterpriseSearchResult["results"];

  other_results: EnterpriseSearchResult["results"];

  used_fallback: boolean;

  fallback_reason: string | null;

  best_similarity: number;

  reliable_identification: boolean;

  identification_meta: {

    decision: "identified" | "review_required" | "no_match";

    confidence: number;

    message: string;

    reasoning: string;

  };

  ai_diagnostics?: Record<string, unknown>;

  similar_available: EnterpriseSearchResult["results"];

};

function confidenceBand(score: number): "exact_match" | "highly_likely" | "possible_match" | "below_threshold" {
  return enterpriseMatchBand(score);
}

function confidenceBandLabel(score: number): string {
  return enterpriseMatchBandLabel(enterpriseMatchBand(score));
}

function computeFinalScore(
  embeddingScore: number,
  enterpriseScore: number,
  openAiScore: number,
  hasOpenAi: boolean,
  opts?: {
    verdict?: ForensicVerdictKind | null;
    gptConfidence?: number;
    structuralConflict?: boolean;
  },
): { score: number; formula: string; displayHint?: string } {
  void embeddingScore;
  const fused = calibrateEnterpriseGptFusion({
    visualScore: enterpriseScore,
    gptScore: openAiScore,
    hasGpt: hasOpenAi,
    verdict: opts?.verdict,
    gptConfidence: opts?.gptConfidence,
    structuralConflict: opts?.structuralConflict,
  });
  return { score: fused.finalScore, formula: fused.formula, displayHint: fused.displayHint };
}

export async function searchInventoryByDressCheckerEnterprise(

  photoBuffer: Buffer,

  filters: EnterpriseSearchFilters = {},

  options: { debug?: boolean; limit?: number } = {},

): Promise<EnterpriseSearchResult> {

  const started = Date.now();

  const requestedMode = (filters.mode || "MANUAL").toUpperCase() as DressSearchMode;
  const limit = options.limit ?? PGVECTOR_SEARCH_DEFAULT_LIMIT;

  const diagnostics: Record<string, unknown> = {

    stages: [] as string[],

    search_mode: "pgvector_fine_grained",

    limit,

    category_mode: requestedMode,

  };

  console.log(
    "[dress-checker] SEARCH START mode=",
    requestedMode,
    "category=",
    filters.category || "(none)",
    "subCategory=",
    filters.subCategory || "(none)",
  );

  const embedStarted = Date.now();

  console.log("[dress-checker] QUERY ANALYSIS START");

  const { hashImageBuffer, getCachedQueryEmbedding, setCachedQueryEmbedding } =
    await import("./searchCache");
  const queryImageHash = hashImageBuffer(photoBuffer);
  diagnostics.query_hash = queryImageHash;

  const queryAnalysis = await analyzeQueryImage(photoBuffer, undefined, {
    category: filters.category || undefined,
  });

  // STEP 1: pool multi-crop embeddings (full / upper / skirt / border / embroidery / motif)
  const pooled = poolViewInvariantQueryEmbedding(queryAnalysis.queryFingerprints);
  const primaryGlobal = queryAnalysis.queryFingerprints[0]?.embeddings?.global ?? [];

  let queryEmbedding = getCachedQueryEmbedding(queryImageHash) ?? [];
  if (queryEmbedding.length >= 64) {
    (diagnostics.stages as string[]).push("query_embedding:cache_hit");
  } else {
    queryEmbedding = pooled.length >= 64 ? pooled : primaryGlobal;

    if (queryEmbedding.length === 768) {
      console.log(
        `[dress-checker] QUERY EMBEDDING view-invariant pool dim=768 crops=${queryAnalysis.queryFingerprints.length}`,
      );
    } else {
      console.warn(
        `[dress-checker] QUERY EMBEDDING fallback dim=${queryEmbedding.length} — running index embedding`,
      );
      queryEmbedding = await generateIndexEmbedding(photoBuffer);
    }
    if (queryEmbedding.length >= 64) {
      setCachedQueryEmbedding(queryImageHash, queryEmbedding);
    }
  }

  const embedMs = Date.now() - embedStarted;

  console.log(`[dress-checker] QUERY EMBEDDING COMPLETE dim=${queryEmbedding.length} ms=${embedMs}`);

  (diagnostics.stages as string[]).push(`query_embedding:${embedMs}ms`);

  const resolved = await resolveEnterpriseSearchScope(queryEmbedding, {
    category: filters.category,
    subCategory: filters.subCategory,
    mode: requestedMode,
  });
  const category = resolved.scope.category || "";
  const subCategory = resolved.scope.subCategory || "";
  diagnostics.resolved_scope = resolved;
  diagnostics.search_scope_label = resolved.searchScopeLabel;
  (diagnostics.stages as string[]).push(`scope_resolve:${resolved.mode}`);

  const vectorStarted = Date.now();

  console.log(
    `[dress-checker] PGVECTOR SEARCH START limit=${limit} scope=${resolved.searchScopeLabel}`,
  );

  const vectorResult = await searchInventoryByPgvector(

    queryEmbedding,

    limit,

    resolved.scope,

  );

  const vectorMs = Date.now() - vectorStarted;

  (diagnostics.stages as string[]).push(`pgvector_search:${vectorMs}ms`);

  const filterDiag = {
    ...buildCategoryFilterDiagnostics(
      vectorResult,
      vectorResult.ok ? vectorResult.candidates.length : 0,
    ),
    ...(resolved.autoProbeCandidates
      ? { auto_probe_candidates: resolved.autoProbeCandidates }
      : {}),
  };
  // Prefer unfiltered ANN probe size as "before" when AUTO predicted a category.
  if (resolved.mode === "AUTO" && resolved.autoProbeCandidates > 0) {
    filterDiag.candidates_before_filtering = resolved.autoProbeCandidates;
  }
  diagnostics.category_filter_diagnostics = filterDiag;

  if (!vectorResult.ok) {

    const filtered = Boolean(resolved.scope.category || resolved.scope.subCategory);
    // Wrong category / empty scope: soft-empty with offer to search entire inventory.
    if (filtered) {
      console.warn(
        `[dress-checker] PGVECTOR empty in scope — offering entire inventory. code=${vectorResult.code}`,
      );
      return {
        ok: true,
        category,
        sub_category: subCategory,
        search_mode: resolved.mode,
        search_scope_label: resolved.searchScopeLabel,
        detected_category: resolved.detectedCategory,
        detected_subcategory: resolved.detectedSubCategory,
        offer_search_entire_inventory: true,
        category_filter_diagnostics: filterDiag,
        search_engine: "pgvector",
        processing_time_ms: Date.now() - started,
        results: [],
        category_results: [],
        other_results: [],
        used_fallback: false,
        fallback_reason: null,
        best_similarity: 0,
        reliable_identification: false,
        identification_meta: {
          decision: "no_match",
          confidence: 0,
          message: `No matches in ${resolved.searchScopeLabel.replace(/^Searching in:\s*/i, "").replace(/\.$/, "")}. Search entire inventory instead?`,
        },
        similar_available: [],
        ai_diagnostics: {
          ...diagnostics,
          vector_failure: {
            code: vectorResult.code,
            reason: vectorResult.reason,
            elapsedMs: vectorResult.elapsedMs,
            indexedCount: vectorResult.indexedCount,
          },
          offer_search_entire_inventory: true,
        },
      } as unknown as EnterpriseSearchResult;
    }

    console.error(

      `[dress-checker] PGVECTOR SEARCH FAILED code=${vectorResult.code} reason=${vectorResult.reason}`,

    );

    diagnostics.vector_failure = {

      code: vectorResult.code,

      reason: vectorResult.reason,

      elapsedMs: vectorResult.elapsedMs,

      indexedCount: vectorResult.indexedCount,

    };

    throw new VectorSearchFailure(

      vectorResult.reason,

      {

        ...diagnostics,

        failure_code: vectorResult.code,

        category: category || undefined,

        embedding_ms: embedMs,

        vector_ms: vectorMs,

        processing_time_ms: Date.now() - started,

      },

      vectorResult.code,

    );

  }

  console.log(

    `[dress-checker] PGVECTOR SEARCH COMPLETE candidates=${vectorResult.candidates.length} indexed=${vectorResult.indexedCount} ms=${vectorResult.elapsedMs}`,

  );

  diagnostics.vector_search = {

    candidates: vectorResult.candidates.length,

    indexedCount: vectorResult.indexedCount,

    elapsedMs: vectorResult.elapsedMs,

  };

  const {
    OPENAI_USAGE_POLICY,
    writeDressSearchAudit,
    understandQueryImage,
  } = await import("./openaiBridalForensics");
  const searchId = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  diagnostics.search_id = searchId;

  // PHASE 3 — GPT query understanding (temporary); drives Stage 3 region weights when confident
  let gptQueryType: string | undefined;
  let gptQueryTypeConf: number | undefined;
  try {
    const qu = await understandQueryImage(photoBuffer);
    if (qu) {
      gptQueryType = qu.queryType;
      gptQueryTypeConf = qu.confidence;
      diagnostics.gpt_query_type = qu;
      (diagnostics.stages as string[]).push(`gpt_query_type:${qu.queryType}:${qu.confidence}`);
      if ((qu.confidence ?? 0) >= 70) {
        const { normalizeDressQueryType } = await import("./queryTypeDetection");
        const normalized = normalizeDressQueryType(String(qu.queryType));
        if (normalized) {
          queryAnalysis.queryType = normalized;
        }
      }
    }
  } catch {
    /* heuristic queryType already on queryAnalysis */
  }

  // PHASE 4 Stage 2 — real fingerprint rerank on ANN → top 20
  type AnnSeed = {
    itemId: number;
    embeddingScore: number;
    seedScore: number;
  };
  const annSeeds: AnnSeed[] = vectorResult.candidates.map((h) => ({
    itemId: h.itemId,
    embeddingScore: h.similarity,
    seedScore: h.similarity,
  }));
  const dropStages: Array<Record<string, unknown>> = [];
  const fusionMetaByItem = new Map<number, string>();

  try {
    const { buildDressFingerprintSummary } = await import("./dressFingerprintSummary");
    const { detectBridalMotifs } = await import("./bridalIdentityHashes");
    const { scoreFingerprintShortlist } = await import("./fingerprintRerank");
    const { learningAdjustmentsForItems } = await import("./positivePairLearning");
    const qFp = queryAnalysis.fingerprint;
    const summary = buildDressFingerprintSummary(qFp);
    const bridalMotifs = detectBridalMotifs(qFp).map((d) => d.kind);
    const dens =
      qFp.embroideryDensity >= 60 ? "heavy" : qFp.embroideryDensity >= 30 ? "medium" : "light";
    const softMode = ["LOWER_SKIRT", "BORDER_ONLY", "BLOUSE_ONLY", "PARTIAL_VIEW", "LOW_LIGHT", "FOLDED", "BLURRY"].includes(
      String(queryAnalysis.queryType || ""),
    );
    const learn = await learningAdjustmentsForItems(annSeeds.map((c) => c.itemId));
    const fpScores = await scoreFingerprintShortlist(
      annSeeds.map((c) => c.itemId),
      {
        primaryColour: qFp.primaryColour,
        colourFamily: qFp.colourFamily,
        motifs: [...summary.motifs, ...bridalMotifs].filter(Boolean),
        embroideryDensity: dens,
        borderType: summary.borderPattern !== "unknown" ? "border" : null,
        softMode,
      },
      learn,
    );
    for (const c of annSeeds) {
      const row = fpScores.get(c.itemId);
      const delta = row?.delta ?? 0;
      c.seedScore = Math.max(0, Math.min(100, c.seedScore + delta));
      if (row?.reasons.length) {
        diagnostics[`fp_${c.itemId}`] = row;
      }
    }
  } catch (err) {
    console.warn(
      "[dress-checker] Stage 2 fingerprint scoring skipped:",
      err instanceof Error ? err.message : err,
    );
  }

  annSeeds.sort((a, b) => b.seedScore - a.seedScore || b.embeddingScore - a.embeddingScore);
  const fingerprintShortlist = annSeeds.slice(0, OPENAI_USAGE_POLICY.fingerprintTopN);
  for (const dropped of annSeeds.slice(OPENAI_USAGE_POLICY.fingerprintTopN)) {
    dropStages.push({
      itemId: dropped.itemId,
      stage: "fingerprint_filter",
      reason: "below_fingerprint_top_n",
      seedScore: dropped.seedScore,
    });
  }
  (diagnostics.stages as string[]).push(`stage_fingerprint_top:${fingerprintShortlist.length}`);

  // PHASE 4 Stage 3 — region / fine-grained rerank ONLY on fingerprint top N → region top N
  const fgStarted = Date.now();
  const fineGrained = await rerankPgvectorCandidatesFineGrained(
    photoBuffer,
    fingerprintShortlist.map((h) => ({
      itemId: h.itemId,
      embeddingScore: h.embeddingScore,
    })),
    category,
    { query: queryAnalysis },
  );
  const fgMs = Date.now() - fgStarted;
  (diagnostics.stages as string[]).push(`fine_grained_rerank:${fgMs}ms`);
  diagnostics.fine_grained_rerank = {
    elapsedMs: fgMs,
    staleWithoutIndex: fineGrained.staleWithoutIndex,
    colourRejected: fineGrained.colourRejected,
    rows: fineGrained.rows.slice(0, OPENAI_USAGE_POLICY.regionTopN),
    inputShortlist: fingerprintShortlist.length,
  };

  const itemIds = fingerprintShortlist.map((h) => h.itemId);
  const items = await prisma.clothingItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      status: true,
      size: true,
      color: true,
      photo: true,
      dailyRate: true,
      subCategory: true,
    },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const hitMap = new Map(vectorResult.candidates.map((h) => [h.itemId, h]));

  const scored: ScoredCandidate[] = [];
  for (const row of fineGrained.rows) {
    const item = itemMap.get(row.itemId);
    const hit = hitMap.get(row.itemId);
    if (!item?.photo || !hit) continue;
    const finalScore = computeFinalScore(row.embeddingScore, row.fineGrainedScore, 0, false);
    scored.push({
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      status: item.status,
      size: item.size || "",
      color: item.color || "",
      photo: catalogPhotoRef(item),
      dailyRate: item.dailyRate,
      subCategory: item.subCategory || "",
      vectorDistance: hit.distance,
      embeddingScore: row.embeddingScore,
      fineGrainedScore: row.fineGrainedScore,
      identityScore: row.identityScore,
      textureScore: row.textureScore,
      components: row.components,
      openAiScore: 0,
      finalScore: finalScore.score,
      reasoning: `${row.rankReason} embed=${row.embeddingScore.toFixed(1)}`,
      rejected: row.rejected,
      rejectReason: row.rejectReason,
      bestRefLabel: row.bestRefLabel,
    });
    if (row.rejected) {
      dropStages.push({
        itemId: item.id,
        stage: "fine_grained",
        reason: row.rejectReason || "rejected",
        score: finalScore.score,
      });
    }
  }

  scored.sort((a, b) => b.fineGrainedScore - a.fineGrainedScore || b.finalScore - a.finalScore);
  const fingerprintTop = scored.filter((c) => !c.rejected).slice(0, OPENAI_USAGE_POLICY.fingerprintTopN);
  const regionTop = fingerprintTop.slice(0, OPENAI_USAGE_POLICY.regionTopN);
  (diagnostics.stages as string[]).push(`stage_region_top:${regionTop.length}`);

  const topForVlm = regionTop.slice(0, OPENAI_USAGE_POLICY.verifyTopN);

  let openAiVerifyMs = 0;

  let openAiUsed = false;
  let gptSkipReason: string | null = null;

  if (isVlmAvailable() && topForVlm.length) {

    console.log(`[dress-checker] OPENAI FORENSIC START top=${topForVlm.length} (gated 70-92)`);

    (diagnostics.stages as string[]).push(`openai_verify:top_${OPENAI_VERIFY_TOP_N}_gated`);

    const verifyStarted = Date.now();

    const vlmCandidates: VlmCandidate[] = [];

    for (const c of topForVlm) {

      const buf = await loadPhotoBuffer(c.photo);

      if (buf) {

        vlmCandidates.push({

          itemId: c.itemId,

          sku: c.sku,

          name: c.name,

          images: [buf],

          preGptScore: c.finalScore,

        });

      }

    }

    if (vlmCandidates.length) {

      const verdict = await verifyDressIdentity(photoBuffer, vlmCandidates);

      openAiUsed = verdict.usedVlm;
      if (!verdict.usedVlm) {
        gptSkipReason =
          (verdict.autoAcceptedIds?.length ? "auto_accept_band" : null) ||
          (verdict.rejectedWithoutGptIds?.length ? "reject_below_threshold" : null) ||
          "policy_skip_no_api";
      }

      openAiVerifyMs = Date.now() - verifyStarted;

      for (const c of scored) {

        const match = verdict.perCandidate.find((p) => p.itemId === c.itemId);

        if (match) {

          let verdictKind: ForensicVerdictKind = "insufficientEvidence";
          if (match.sameCollection && !match.sameDress) verdictKind = "sameCollection";
          else if (match.sameDress) verdictKind = "sameDress";
          else if (match.confidence >= 90) verdictKind = "differentDress";

          if (verdictKind === "sameCollection") {
            c.openAiScore = Math.min(match.confidence, 65);
            c.rejected = false;
            c.rejectReason = c.rejectReason || "same_collection_lookalike";
          } else {
            c.openAiScore = match.sameDress
              ? match.confidence
              : Math.min(match.confidence, 45);
          }

          const fused = computeFinalScore(
            c.embeddingScore,
            c.fineGrainedScore,
            c.openAiScore,
            true,
            {
              verdict: verdictKind,
              gptConfidence: match.confidence,
              structuralConflict: Boolean(
                match.differences?.some((d) => /border|motif|panel/i.test(d)),
              ),
            },
          );
          c.finalScore = fused.score;
          fusionMetaByItem.set(c.itemId, fused.formula);

          const idHint =
            match.matchedIdentifiers?.length
              ? ` ids=[${match.matchedIdentifiers.slice(0, 4).join("; ")}]`
              : "";

          const collHint = match.sameCollection ? " sameCollection" : "";

          c.reasoning = `${c.reasoning} openai=${verdictKind}:${c.openAiScore.toFixed(0)}${collHint}${idHint} fusion=${fused.formula} "${match.reasoning.slice(0, 100)}"`;
          if (fused.displayHint) {
            c.reasoning = `${c.reasoning} [${fused.displayHint}]`;
          }

        }

      }

      scored.sort((a, b) => b.finalScore - a.finalScore);

      diagnostics.openai_verify = {

        ...verdict,

        elapsedMs: openAiVerifyMs,

        topN: OPENAI_VERIFY_TOP_N,

      };

      (diagnostics.stages as string[]).push(`openai_verify:${openAiVerifyMs}ms`);

      console.log(

        `[dress-checker] OPENAI VERIFY COMPLETE match=${verdict.matchItemId ?? "none"} confidence=${verdict.confidence} ms=${openAiVerifyMs}`,

      );

    } else {

      (diagnostics.stages as string[]).push("openai_verify:no_images");

    }

  } else {

    const skipReason = !isVlmAvailable()

      ? "OPENAI_UNAVAILABLE: DRESS_CHECKER_VLM=0"

      : !topForVlm.length

        ? "OPENAI_VERIFY_SKIPPED: no top candidates"

        : "OPENAI_VERIFY_SKIPPED";

    console.warn(`[dress-checker] OPENAI VERIFY skipped reason=${skipReason}`);

    diagnostics.openai_verify_skip = skipReason;
    gptSkipReason = skipReason;

    (diagnostics.stages as string[]).push(`openai_verify:skipped:${skipReason}`);

  }

  const processingTimeMs = Date.now() - started;

  const best = scored[0];

  const bestScore = best?.finalScore ?? 0;

  // PHASE 10 — forensic audit of every search / GPT decision
  try {
    await writeDressSearchAudit({
      searchId,
      queryType: gptQueryType || queryAnalysis.queryType || null,
      queryTypeConfidence: gptQueryTypeConf ?? null,
      queryHash: (await import("./searchCache")).hashImageBuffer(photoBuffer),
      candidateIds: scored.slice(0, 20).map((c) => c.itemId),
      embeddingsMeta: {
        dim: queryEmbedding.length,
        embedMs,
        annLimit: limit,
      },
      fingerprintsMeta: {
        fingerprintTop: fingerprintTop.map((c) => ({
          id: c.itemId,
          sku: c.sku,
          score: c.finalScore,
        })),
        regionTop: regionTop.map((c) => ({ id: c.itemId, sku: c.sku, score: c.finalScore })),
      },
      gptPrompt: openAiUsed ? "bridal_forensic_v2" : null,
      gptResponse: diagnostics.openai_verify ?? diagnostics.openai_verify_skip ?? null,
      gptCalled: openAiUsed,
      gptSkipReason: gptSkipReason || (diagnostics.openai_verify_skip as string) || null,
      stageTimings: {
        embedMs,
        vectorMs: vectorResult.elapsedMs,
        fineGrainedMs: fgMs,
        openaiVerifyMs: openAiVerifyMs,
        totalMs: processingTimeMs,
      },
      fusionMeta: Object.fromEntries(fusionMetaByItem),
      dropStages,
      finalDecision: {
        bestItemId: best?.itemId ?? null,
        bestScore,
        identifiedByOpenAi:
          (diagnostics.openai_verify as { matchItemId?: number | null } | undefined)?.matchItemId !=
          null,
      },
      finalItemId: best?.itemId ?? null,
      finalScore: bestScore,
    });
  } catch {
    /* audit best-effort */
  }

  const openAiVerdict = diagnostics.openai_verify as

    | { matchItemId?: number | null; confidence?: number; reasoning?: string }

    | undefined;

  const identifiedByOpenAi =

    openAiVerdict?.matchItemId != null &&
    (openAiVerdict.confidence ?? 0) >= OPENAI_VERIFY_CONFIDENCE.veryLikely;

  console.log(

    `[dress-checker] SEARCH COMPLETE candidates=${scored.length} best=${bestScore.toFixed(1)} ms=${processingTimeMs}`,

  );

  const toResult = (c: ScoredCandidate) => {

    const vlmRow = (

      diagnostics.openai_verify as

        | {

            perCandidate?: Array<{

              itemId: number;

              sameDress?: boolean;

              exactMatch: boolean;

              confidence: number;

              reasoning: string;

              reasons?: string[];

              matchedIdentifiers?: string[];

            }>;

          }

        | undefined

    )?.perCandidate?.find((p) => p.itemId === c.itemId);

    return {

      id: c.itemId,

      name: c.name,

      display_name: dressDisplayName(c.name, c.category, c.size),

      sku: c.sku,

      category: c.category,

      status: c.status,

      size: c.size,

      color: c.color,

      photo: c.photo,

      daily_rate: c.dailyRate,

      sub_category: c.subCategory,

      inventory_location: "",

      similarity: Math.round(c.finalScore * 10) / 10,

      vector_similarity: Math.round(c.embeddingScore * 10) / 10,

      vector_distance: Math.round(c.vectorDistance * 10000) / 10000,

      confidence_band: confidenceBand(c.finalScore),
      confidence_label: confidenceBandLabel(c.finalScore),
      confidence: mapConfidence(c.finalScore),

      rank_reason: c.reasoning,

      embedding_score: c.embeddingScore,

      fine_grained_score: c.fineGrainedScore,

      color_score: c.components.colorScore,

      border_score: c.components.borderScore,

      motif_score: c.components.motifScore,

      stone_score: c.components.stoneScore,

      panel_score: c.components.panelScore,

      blouse_score: c.components.blouseScore,

      dupatta_score: c.components.dupattaScore,

      openai_score: c.openAiScore,

      identity_score: c.identityScore,

      texture_score: c.textureScore,

      rejected: c.rejected,

      reject_reason: c.rejectReason,

      fine_grained_reasons: c.components.reasons,

      ...(vlmRow

        ? {

            openai_verification: {

              sameDress: vlmRow.sameDress ?? vlmRow.exactMatch,

              exactMatch: vlmRow.sameDress ?? vlmRow.exactMatch,

              confidence: vlmRow.confidence,

              reasoning: vlmRow.reasoning,

              differences: vlmRow.reasons,

              reasons: vlmRow.reasons,

              matchedIdentifiers: vlmRow.matchedIdentifiers ?? [],

            },

          }

        : {}),

    };

  };

  const results = scored
    .filter((c) => shouldDisplayEnterpriseMatch(c.finalScore, c.rejected))
    .slice(0, limit)
    .map(toResult);

  const decision =
    identifiedByOpenAi || bestScore >= ENTERPRISE_DISPLAY_THRESHOLDS.exactMatch
      ? "identified"
      : bestScore >= ENTERPRISE_DISPLAY_THRESHOLDS.possibleMatch
        ? "review_required"
        : "no_match";

  return {

    ok: true,

    category,

    sub_category: subCategory,

    search_mode: resolved.mode,

    search_scope_label: resolved.searchScopeLabel,

    detected_category: resolved.detectedCategory || category,

    detected_subcategory: resolved.detectedSubCategory || subCategory,

    offer_search_entire_inventory:
      results.length === 0 && Boolean(resolved.scope.category || resolved.scope.subCategory),

    category_filter_diagnostics: filterDiag,

    search_engine: "pgvector",

    processing_time_ms: processingTimeMs,

    results,

    category_results: results,

    other_results: [],

    used_fallback: false,

    fallback_reason: null,

    best_similarity: bestScore,

    reliable_identification: identifiedByOpenAi || bestScore >= ENTERPRISE_DISPLAY_THRESHOLDS.exactMatch,

    identification_meta: {

      decision,

      confidence: bestScore,

      message:

        identifiedByOpenAi

          ? "OpenAI confirmed exact same physical garment"

          : decision === "identified"

            ? "High-confidence fine-grained match"

            : decision === "review_required"

              ? "Review top candidates — similar colour/style may need manual verification"

              : "No reliable match — likely different physical garment",

      reasoning: openAiVerdict?.reasoning || best?.reasoning || "No candidates",

    },

    ai_diagnostics: options.debug

      ? {

          ...diagnostics,

          /** All shortlist candidates including rejected (debug only). */
          scored,

          rejected: scored
            .filter((c) => c.rejected)
            .map((c) => ({
              itemId: c.itemId,
              sku: c.sku,
              name: c.name,
              finalScore: c.finalScore,
              rejectReason: c.rejectReason || "Rejected",
              reasons: c.components.reasons,
            })),

          query_detected: buildQueryDetected(fineGrained.query),

          embedding_ms: embedMs,

          vector_ms: vectorResult.elapsedMs,

          fine_grained_ms: fgMs,

          openai_verify_ms: openAiVerifyMs,

          openai_used: openAiUsed,

          processing_time_ms: processingTimeMs,

          query_category: fineGrained.query.category,

        }

      : undefined,

    similar_available: results.filter((r) => r.confidence.label !== "low" && r.confidence.reliable),

  };

}

