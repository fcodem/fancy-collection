import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import { searchInventoryByDressCheckerEnterprise } from "@/lib/dressChecker/enterpriseSearch";
import { getDressCheckerSearchHealth } from "@/lib/dressChecker/searchHealth";
import { isPgvectorAvailable } from "@/lib/ai/pgvector";
import { isVlmAvailable } from "@/lib/dressChecker/vlmIdentity";
import {
  appendDressCheckerDebugHistory,
  getDressCheckerDebugHistoryEntry,
  listDressCheckerDebugHistory,
  type DressCheckerDebugCandidate,
  type DressCheckerDebugPayload,
  type DressCheckerDebugQueryDetected,
} from "@/lib/dressChecker/dressCheckerDebugHistory";

/** Dress checker + OpenAI verify can exceed default serverless limits. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ScoredDiag = {
  itemId: number;
  sku: string;
  name: string;
  photo: string;
  category: string;
  embeddingScore: number;
  fineGrainedScore: number;
  identityScore: number | null;
  textureScore: number | null;
  components: {
    colorScore: number;
    borderScore: number;
    motifScore: number;
    stoneScore: number;
    reasons: string[];
  };
  openAiScore: number;
  finalScore: number;
  rejected: boolean;
  rejectReason?: string;
  reasoning: string;
};

function emptyQueryDetected(): DressCheckerDebugQueryDetected {
  return {
    category: "",
    colours: { primary: "", secondary: "", accents: [], family: "", label: "" },
    motifs: [],
    embroideryDensity: 0,
    embroideryStyle: "",
    embroideryLabel: "",
  };
}

function mapCandidates(
  scored: ScoredDiag[],
  openaiByItem: Map<
    number,
    { exactMatch: boolean; confidence: number; reasoning: string; reasons?: string[] }
  >,
): DressCheckerDebugCandidate[] {
  return scored.map((c, i) => {
    const vlm = openaiByItem.get(c.itemId) ?? null;
    return {
      rank: i + 1,
      itemId: c.itemId,
      sku: c.sku,
      name: c.name,
      photo: c.photo,
      category: c.category,
      embeddingScore: Math.round(c.embeddingScore * 10) / 10,
      colourScore: c.components.colorScore,
      borderScore: c.components.borderScore,
      motifScore: c.components.motifScore,
      stoneScore: c.components.stoneScore,
      textureScore: c.textureScore,
      identityScore: c.identityScore,
      openAiScore: Math.round(c.openAiScore * 10) / 10,
      finalScore: Math.round(c.finalScore * 10) / 10,
      rejected: c.rejected,
      rejectReason: c.rejectReason,
      reasons: [
        ...(c.components.reasons ?? []),
        ...(vlm?.reasons ?? []),
      ],
      rankReason: c.reasoning,
      openAiVerification: vlm,
    };
  });
}

function buildPayload(
  result: Awaited<ReturnType<typeof searchInventoryByDressCheckerEnterprise>>,
): DressCheckerDebugPayload {
  const diag = result.ai_diagnostics as
    | {
        scored?: ScoredDiag[];
        query_detected?: DressCheckerDebugQueryDetected;
        openai_verify?: {
          perCandidate?: Array<{
            itemId: number;
            exactMatch: boolean;
            confidence: number;
            reasoning: string;
            reasons?: string[];
          }>;
        };
        stages?: string[];
        fine_grained_ms?: number;
        vector_ms?: number;
        openai_verify_ms?: number;
        embedding_ms?: number;
        openai_used?: boolean;
        rejected?: unknown;
      }
    | undefined;

  const openaiByItem = new Map(
    (diag?.openai_verify?.perCandidate ?? []).map((p) => [p.itemId, p]),
  );

  const scored = Array.isArray(diag?.scored) ? diag!.scored! : [];
  const candidates = mapCandidates(scored, openaiByItem);
  const rejected_candidates = candidates.filter((c) => c.rejected);

  return {
    processing_time_ms: result.processing_time_ms,
    identification_meta: result.identification_meta,
    best_similarity: result.best_similarity,
    query_detected: diag?.query_detected ?? emptyQueryDetected(),
    candidates,
    rejected_candidates,
    ai_diagnostics: {
      stages: diag?.stages,
      embedding_ms: diag?.embedding_ms,
      fine_grained_ms: diag?.fine_grained_ms,
      vector_ms: diag?.vector_ms,
      openai_verify_ms: diag?.openai_verify_ms,
      openai_used: diag?.openai_used,
      rejected_count: rejected_candidates.length,
    },
  };
}

export async function GET(req: Request) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const download = url.searchParams.get("download") === "1";

    if (id) {
      const entry = await getDressCheckerDebugHistoryEntry(id);
      if (!entry) return jsonError("History entry not found", 404);
      if (download) {
        return new Response(JSON.stringify(entry.payload, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="dress-checker-debug-${id}.json"`,
          },
        });
      }
      return jsonOk({ entry });
    }

    const [pgvector, searchHealth, history] = await Promise.all([
      isPgvectorAvailable(),
      getDressCheckerSearchHealth(),
      listDressCheckerDebugHistory(),
    ]);

    return jsonOk({
      pgvector,
      openaiVerification: isVlmAvailable(),
      searchHealth,
      history,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Health check failed";
    console.error("[dress-checker-debug] GET failed:", e);
    return jsonError(message, 500);
  }
}

export async function POST(req: Request) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const form = await req.formData();
  const photo = form.get("photo");
  if (!photo || !(photo instanceof File)) return jsonError("No photo uploaded", 400);

  const category = (form.get("category") as string) || "";

  try {
    const buffer = Buffer.from(await photo.arrayBuffer());
    if (buffer.length === 0) return jsonError("Uploaded photo is empty", 400);
    if (buffer.length > 10 * 1024 * 1024) return jsonError("Photo too large (max 10MB)", 400);

    const result = await searchInventoryByDressCheckerEnterprise(
      buffer,
      { category },
      { debug: true },
    );

    const payload = buildPayload(result);
    const historyEntry = await appendDressCheckerDebugHistory({
      categoryHint: category,
      payload,
    });

    return jsonOk({
      ...payload,
      history_id: historyEntry.id,
      history: await listDressCheckerDebugHistory(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    console.error("[dress-checker-debug]", e);
    return jsonError(message, 500);
  }
}
