import { IDENTIFICATION_INDEX_VERSION } from "../dressIdentificationTypes";
import { adaptiveColourGate } from "../inventoryColourSemantics";
import { loadCatalogCandidatesByIds } from "./catalog";
import { compareFineGrainedFingerprints } from "./fineGrainedScoring";
import type { FineGrainedComponentScores } from "./fineGrainedTypes";
import { searchGarmentIdentity } from "./identitySearchEngine";
import { analyzeQueryImage } from "./processQuery";
import type { QueryAnalysis } from "./types";
import type { IdentificationIndex } from "../dressIdentificationTypes";
import { ENTERPRISE_DISPLAY_THRESHOLDS } from "./enterpriseMatchScore";

const EMPTY_INDEX: IdentificationIndex = {
  version: IDENTIFICATION_INDEX_VERSION,
  modelId: "",
  preprocessingVersion: 0,
  embeddingDimension: 768,
  contentHash: "",
  indexedAt: "",
  category: "",
  references: [],
};

export type FineGrainedRerankRow = {
  itemId: number;
  embeddingScore: number;
  fineGrainedScore: number;
  identityScore: number | null;
  /** Identity texture component (0–100); null when identity was not scored. */
  textureScore: number | null;
  components: FineGrainedComponentScores;
  hasIdentityIndex: boolean;
  hasFingerprint: boolean;
  rankReason: string;
  rejected: boolean;
  rejectReason?: string;
  bestRefLabel?: string;
};

export type FineGrainedRerankResult = {
  query: QueryAnalysis;
  rows: FineGrainedRerankRow[];
  elapsedMs: number;
  staleWithoutIndex: number;
  colourRejected: number;
};

/**
 * Stage 3 — fine-grained re-ranking on pgvector shortlist.
 * Colour-family mismatch is adaptive: hard reject only when reliable and structure is weak.
 */
export async function rerankPgvectorCandidatesFineGrained(
  photoBuffer: Buffer,
  shortlist: Array<{ itemId: number; embeddingScore: number }>,
  categoryHint = "",
  options: { query?: QueryAnalysis } = {},
): Promise<FineGrainedRerankResult> {
  const started = Date.now();
  console.log(`[dress-checker] FINE-GRAINED RERANK START candidates=${shortlist.length}`);

  const query =
    options.query ??
    (await analyzeQueryImage(photoBuffer, undefined, {
      category: categoryHint || undefined,
    }));

  const catalogMap = await loadCatalogCandidatesByIds(shortlist.map((s) => s.itemId));
  let staleWithoutIndex = 0;
  let colourRejected = 0;

  const rows: FineGrainedRerankRow[] = [];
  for (const hit of shortlist) {
    const catalog = catalogMap.get(hit.itemId);
    const invFp = catalog?.fingerprint ?? null;
    const hasIndex = (catalog?.identificationIndex?.references?.length ?? 0) > 0;
    const hasFingerprint = !!invFp;

    if (!hasIndex && !hasFingerprint) {
      staleWithoutIndex++;
      rows.push({
        itemId: hit.itemId,
        embeddingScore: hit.embeddingScore,
        fineGrainedScore: Math.round(hit.embeddingScore * 0.6),
        identityScore: null,
        textureScore: null,
        components: {
          colorScore: 0,
          borderScore: 0,
          motifScore: 0,
          stoneScore: 0,
          panelScore: 0,
          blouseScore: 0,
          dupattaScore: 0,
          fineGrainedScore: Math.round(hit.embeddingScore * 0.6),
          reasons: ["No identity index — run full reindex for fine-grained matching"],
        },
        hasIdentityIndex: false,
        hasFingerprint: false,
        rankReason: `embedding-only (no index) ${hit.embeddingScore.toFixed(1)}%`,
        rejected: true,
        rejectReason: "No identity index",
      });
      continue;
    }

    let identityScore: number | null = null;
    let textureScore: number | null = null;
    let rejected = false;
    let rejectReason: string | undefined;
    let bestRefLabel: string | undefined;

    if (hasIndex && catalog) {
      const identity = searchGarmentIdentity({
        queryViews: query.queryFingerprints,
        queryFingerprint: query.fingerprint,
        inventoryIndex: catalog.identificationIndex ?? EMPTY_INDEX,
        inventoryFingerprint: invFp,
        partialView: query.partialView ?? "full",
        queryType: query.queryType,
      });
      identityScore = identity.identity.final;
      textureScore = identity.identity.texture;
      rejected = identity.rejected;
      rejectReason = identity.rejectReason;
      bestRefLabel = identity.identity.bestRefLabel;
      console.log(
        `[dress-checker] FINE-GRAINED item=${hit.itemId} identity=${identityScore} rejected=${identity.rejected}`,
      );
    }

    const components = invFp
      ? compareFineGrainedFingerprints(
          query.fingerprint,
          invFp,
          categoryHint || query.category || invFp.category,
        )
      : {
          colorScore: 0,
          borderScore: 0,
          motifScore: 0,
          stoneScore: 0,
          panelScore: 0,
          blouseScore: 0,
          dupattaScore: 0,
          fineGrainedScore: identityScore ?? 0,
          reasons: ["Region embedding match only"],
        };

    const colourGate = adaptiveColourGate({
      queryFamily: query.fingerprint.colourFamily,
      inventoryFamily: invFp?.colourFamily ?? null,
      inventoryName: catalog?.name,
      inventoryColor: catalog?.color,
      queryDiagnostics: query.fingerprint.colourDiagnostics ?? null,
      inventoryDiagnostics: invFp?.colourDiagnostics ?? null,
      embeddingScore: hit.embeddingScore,
      queryType: query.queryType,
      borderScore: components.borderScore,
      motifScore: components.motifScore,
      panelScore: components.panelScore,
      structuralScore: identityScore ?? components.fineGrainedScore,
    });

    let fineGrainedScore = identityScore ?? components.fineGrainedScore;
    const colourReason =
      colourGate.action !== "none"
        ? `colour_${colourGate.action}:${colourGate.rule} ${colourGate.reason}`
        : null;
    if (colourGate.action === "reject") {
      colourRejected++;
      rejected = true;
      rejectReason = colourGate.reason;
      fineGrainedScore = Math.min(
        ENTERPRISE_DISPLAY_THRESHOLDS.possibleMatch - 1,
        Math.round(fineGrainedScore * 0.55),
      );
      console.log(`[dress-checker] COLOUR REJECT item=${hit.itemId} ${colourGate.reason}`);
    } else if (colourGate.action === "penalty") {
      fineGrainedScore = Math.max(0, fineGrainedScore - colourGate.penalty);
      components.reasons.push(colourReason || `Colour penalty ${colourGate.penalty}`);
      console.log(
        `[dress-checker] COLOUR PENALTY item=${hit.itemId} penalty=${colourGate.penalty} ${colourGate.reason}`,
      );
    }

    const rankReason = [
      `fg=${fineGrainedScore}`,
      `border=${components.borderScore}`,
      `motif=${components.motifScore}`,
      `stone=${components.stoneScore}`,
      identityScore != null ? `identity=${identityScore}` : null,
      bestRefLabel ? `ref=${bestRefLabel}` : null,
      colourReason,
      rejected ? "REJECTED" : null,
    ]
      .filter(Boolean)
      .join(" ");

    rows.push({
      itemId: hit.itemId,
      embeddingScore: hit.embeddingScore,
      fineGrainedScore,
      identityScore,
      textureScore,
      components,
      hasIdentityIndex: hasIndex,
      hasFingerprint,
      rankReason,
      rejected,
      rejectReason,
      bestRefLabel,
    });
  }

  rows.sort((a, b) => b.fineGrainedScore - a.fineGrainedScore || b.embeddingScore - a.embeddingScore);

  const elapsedMs = Date.now() - started;
  console.log(
    `[dress-checker] FINE-GRAINED RERANK COMPLETE rows=${rows.length} colourRejected=${colourRejected} stale=${staleWithoutIndex} ms=${elapsedMs}`,
  );

  return { query, rows, elapsedMs, staleWithoutIndex, colourRejected };
}
