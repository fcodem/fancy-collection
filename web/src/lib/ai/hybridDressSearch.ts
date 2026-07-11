import prisma from "@/lib/prisma";
import { catalogPhotoRef } from "@/lib/catalogPhotoRef";
import { dressDisplayName } from "@/lib/dress";
import { loadPhotoBuffer } from "@/lib/services/siglipSearch";
import OpenAI from "openai";
import {
  createOpenAiClient,
  generateTextEmbedding,
  generateVisionMetadataFromOpenAi,
} from "./openaiVision";
import { readAiRuntimeSettings } from "./aiRuntimeSettings";
import { searchNearestInventoryByVector } from "./pgvector";
import { createHash } from "crypto";

export type HybridSearchFilters = {
  category?: string;
};

type HybridResultItem = {
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
  confidence: "high" | "medium" | "low";
  rank_reason: string;
  ai_explanation?: string;
  expected_return_date?: string | null;
  next_available_date?: string | null;
  upcoming_booking_count?: number;
  vector_similarity?: number;
};

type HybridSearchResponse = {
  ok: true;
  category: string;
  category_results: HybridResultItem[];
  other_results: HybridResultItem[];
  used_fallback: boolean;
  results: HybridResultItem[];
  search_engine: "openai_pgvector_hybrid";
  best_similarity: number;
  reliable_identification: boolean;
  identification_meta: {
    decision: "identified" | "review_required" | "no_match";
    confidence: number;
    message: string;
    reasoning: string;
  };
  ai_diagnostics?: Record<string, unknown>;
  similar_available: HybridResultItem[];
};

const searchCache = new Map<string, { expiresAt: number; value: HybridSearchResponse }>();

function hashInput(image: Buffer, category?: string) {
  return createHash("sha256")
    .update(image)
    .update("|")
    .update(category || "")
    .digest("hex");
}

function confidenceBand(score: number): "high" | "medium" | "low" {
  if (score >= 95) return "high";
  if (score >= 85) return "medium";
  return "low";
}

function normalizePhotoDataUrl(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function rerankWithOpenAi(
  queryImage: Buffer,
  candidates: Array<{
    itemId: number;
    sku: string;
    name: string;
    category: string;
    metadata: Record<string, unknown> | null;
    image: Buffer;
    vectorSimilarity: number;
  }>,
): Promise<{
  bestItemId: number | null;
  confidence: number;
  reasoning: string;
  ranked: Array<{ itemId: number; confidence: number; reason: string }>;
}> {
  if (!candidates.length) {
    return { bestItemId: null, confidence: 0, reasoning: "No vector candidates", ranked: [] };
  }
  const settings = await readAiRuntimeSettings();
  const model = settings.visionModel || "gpt-4.1-mini";
  const client = await createOpenAiClient(settings.timeoutMs || 30000);

  const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [
    {
      type: "input_text",
      text:
        "Compare uploaded image with candidate inventory items and return strict JSON only with best match, confidence, ranking, and concise reasoning.",
    },
    { type: "input_image", image_url: normalizePhotoDataUrl(queryImage) },
  ];

  candidates.forEach((candidate, idx) => {
    content.push({
      type: "input_text",
      text: `Candidate ${idx + 1}
itemId=${candidate.itemId}
sku=${candidate.sku}
name=${candidate.name}
category=${candidate.category}
vectorSimilarity=${candidate.vectorSimilarity.toFixed(2)}
metadata=${JSON.stringify(candidate.metadata || {})}`,
    });
    content.push({
      type: "input_image",
      image_url: normalizePhotoDataUrl(candidate.image),
    });
  });
  content.push({
    type: "input_text",
    text: `Return JSON:
{
 "bestItemId": number|null,
 "confidence": number,
 "reasoning": string,
 "ranking": [{"itemId":number,"confidence":number,"reason":string}]
}`,
  });

  const payload = await client.responses.create({
      model,
      temperature: 0.1,
      input: [{ role: "user", content }],
    } as OpenAI.Responses.ResponseCreateParamsNonStreaming);
  const raw = (payload.output_text || "")
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(raw) as {
    bestItemId?: number | null;
    confidence?: number;
    reasoning?: string;
    ranking?: Array<{ itemId?: number; confidence?: number; reason?: string }>;
  };
  const ranked = (parsed.ranking || [])
    .map((row) => ({
      itemId: Number(row.itemId || 0),
      confidence: Number(row.confidence || 0),
      reason: String(row.reason || ""),
    }))
    .filter((row) => row.itemId > 0);

  return {
    bestItemId: parsed.bestItemId ?? null,
    confidence: Number(parsed.confidence || 0),
    reasoning: String(parsed.reasoning || ""),
    ranked,
  };
}

async function upcomingBookingStats(itemId: number) {
  const now = new Date();
  const active = await prisma.bookingItem.findMany({
    where: {
      itemId,
      booking: { status: { in: ["booked", "delivered"] }, returnDate: { gte: now } },
    },
    select: { booking: { select: { returnDate: true } } },
    orderBy: { booking: { returnDate: "asc" } },
    take: 20,
  });
  return {
    expectedReturnDate: active[0]?.booking.returnDate?.toISOString() ?? null,
    nextAvailableDate: active[0]?.booking.returnDate?.toISOString() ?? null,
    upcomingBookingCount: active.length,
  };
}

export async function searchInventoryByOpenAiHybrid(
  photoBuffer: Buffer,
  filters: HybridSearchFilters = {},
  options: { debug?: boolean } = {},
): Promise<HybridSearchResponse> {
  const cacheKey = `search:${hashInput(photoBuffer, filters.category)}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const started = Date.now();
  const queryMetadata = await generateVisionMetadataFromOpenAi(photoBuffer, {
    category: filters.category || "unknown",
    itemType: "clothing",
  });
  const queryText = JSON.stringify(queryMetadata);
  const queryEmbedding = await generateTextEmbedding(queryText);

  const nearest = await searchNearestInventoryByVector(queryEmbedding, 5, filters.category);
  const candidateIds = nearest.map((row) => row.itemId);
  const candidatesRaw = candidateIds.length
    ? await prisma.clothingItem.findMany({
        where: { id: { in: candidateIds } },
        include: {
          aiProfile: {
            select: {
              garmentAttributes: true,
              jewelleryAttributes: true,
              description: true,
            },
          },
        },
      })
    : [];

  const candidates = (
    await Promise.all(
      candidatesRaw.map(async (item) => {
        const vector = nearest.find((row) => row.itemId === item.id);
        const photoRef = catalogPhotoRef(item);
        const image = await loadPhotoBuffer(photoRef || item.photo || "");
        if (!image) return null;
        return {
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          metadata: {
            description: item.aiProfile?.description || "",
            garmentAttributes: item.aiProfile?.garmentAttributes || {},
            jewelleryAttributes: item.aiProfile?.jewelleryAttributes || {},
          },
          image,
          vectorSimilarity: vector?.similarity || 0,
        };
      }),
    )
  ).filter((row): row is NonNullable<typeof row> => row !== null);

  const reranked = await rerankWithOpenAi(photoBuffer, candidates);
  const orderedIds = reranked.ranked.map((row) => row.itemId);
  const finalRows = (orderedIds.length ? orderedIds : candidateIds)
    .map((id) => candidatesRaw.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const results: HybridResultItem[] = [];
  for (const row of finalRows) {
    const rank = reranked.ranked.find((item) => item.itemId === row.id);
    const vector = nearest.find((item) => item.itemId === row.id);
    const stats = await upcomingBookingStats(row.id);
    const score = Math.max(0, Math.min(100, rank?.confidence ?? vector?.similarity ?? 0));
    results.push({
      id: row.id,
      name: row.name,
      display_name: dressDisplayName(row.name, row.category, row.size),
      sku: row.sku,
      category: row.category,
      status: row.status,
      size: row.size || "",
      color: row.color || "",
      photo: catalogPhotoRef(row) || "",
      daily_rate: row.dailyRate,
      sub_category: row.subCategory || "",
      inventory_location: row.subCategory || "Main Rack",
      similarity: score,
      confidence: confidenceBand(score),
      rank_reason: rank?.reason || reranked.reasoning || "Vector + OpenAI hybrid rank",
      ai_explanation: rank?.reason || undefined,
      expected_return_date: stats.expectedReturnDate,
      next_available_date: stats.nextAvailableDate,
      upcoming_booking_count: stats.upcomingBookingCount,
      vector_similarity: vector?.similarity ?? 0,
    });
  }

  const best = results[0];
  const reliable = (reranked.confidence || best?.similarity || 0) >= 95;
  const needsReview = !reliable && (reranked.confidence || best?.similarity || 0) >= 85;
  const category = filters.category || queryMetadata.category || "";

  const decision: HybridSearchResponse["identification_meta"] = reliable
    ? {
        decision: "identified",
        confidence: reranked.confidence || best?.similarity || 0,
        message: "Exact match identified.",
        reasoning: reranked.reasoning,
      }
    : needsReview
      ? {
          decision: "review_required",
          confidence: reranked.confidence || best?.similarity || 0,
          message: "Possible match. Staff confirmation required.",
          reasoning: reranked.reasoning,
        }
      : {
          decision: "no_match",
          confidence: reranked.confidence || best?.similarity || 0,
          message: "No reliable match found.",
          reasoning: reranked.reasoning || "Confidence below threshold.",
        };

  const categoryResults = category ? results.filter((row) => row.category === category) : results;
  const otherResults = category ? results.filter((row) => row.category !== category) : [];

  const similarAvailable = results.filter((row) => row.status === "available").slice(0, 5);

  const response: HybridSearchResponse = {
    ok: true,
    category,
    category_results: categoryResults,
    other_results: otherResults,
    used_fallback: false,
    results,
    search_engine: "openai_pgvector_hybrid",
    best_similarity: best?.similarity || 0,
    reliable_identification: decision.decision === "identified",
    identification_meta: decision,
    similar_available: similarAvailable,
    ...(options.debug
      ? {
          ai_diagnostics: {
            processingMs: Date.now() - started,
            queryMetadata,
            embeddingGenerated: queryEmbedding.length > 0,
            topCandidates: nearest,
            rerank: reranked,
            rejectionReason:
              decision.decision === "no_match" ? "Confidence below 85%" : undefined,
          },
        }
      : {}),
  };
  searchCache.set(cacheKey, { value: response, expiresAt: Date.now() + 60_000 });
  return response;
}
