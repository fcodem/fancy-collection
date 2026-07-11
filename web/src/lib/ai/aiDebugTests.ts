import prisma from "@/lib/prisma";
import {
  countIndexedPgvectorEmbeddings,
  isPgvectorAvailable,
  searchInventoryByPgvector,
} from "@/lib/ai/pgvector";
import { verifyOpenAiApiKey } from "@/lib/ai/verifyOpenAiKey";
import { resolveOpenAiKey } from "@/lib/ai/aiRuntimeSettings";
import { generateInventoryImageEmbedding } from "@/lib/ai/imageEmbedding/imageEmbeddingService";
import { searchInventoryByDressCheckerEnterprise } from "@/lib/dressChecker/enterpriseSearch";
import { loadPhotoBuffer } from "@/lib/services/siglipSearch";
import { isVlmAvailable } from "@/lib/dressChecker/vlmIdentity";

export type SearchTestMatch = {
  itemId: number;
  sku: string;
  name: string;
  vectorSimilarity: number;
  openAiScore: number;
  finalScore: number;
  rank: number;
};

export type ItemSearchTestResult = {
  ok: boolean;
  itemId: number;
  searchEngine: string;
  processingTimeMs: number;
  selfRank: number | null;
  topMatches: SearchTestMatch[];
  error?: string;
};

export async function runOpenAiTest(): Promise<{
  ok: boolean;
  message: string;
  verificationEnabled: boolean;
}> {
  const verificationEnabled = isVlmAvailable();
  if (!verificationEnabled) {
    return {
      ok: false,
      message: "OpenAI verification disabled (DRESS_CHECKER_VLM=0)",
      verificationEnabled: false,
    };
  }
  const key = await resolveOpenAiKey();
  const result = await verifyOpenAiApiKey(key);
  if (!result.ok) {
    return { ok: false, message: result.error, verificationEnabled: true };
  }
  return { ok: true, message: "OpenAI API key is valid", verificationEnabled: true };
}

export async function runPgvectorTest(): Promise<{
  ok: boolean;
  message: string;
  extensionInstalled: boolean;
  indexedCount: number;
  sampleQueryMs?: number;
  sampleHits?: number;
}> {
  const extensionInstalled = await isPgvectorAvailable();
  if (!extensionInstalled) {
    return {
      ok: false,
      message: "pgvector extension or embedding_vector column missing",
      extensionInstalled: false,
      indexedCount: 0,
    };
  }

  const indexedCount = await countIndexedPgvectorEmbeddings();
  if (indexedCount === 0) {
    return {
      ok: false,
      message: "pgvector available but no embeddings indexed",
      extensionInstalled: true,
      indexedCount: 0,
    };
  }

  const sampleItem = await prisma.clothingItem.findFirst({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: { id: true, photo: true },
    orderBy: { id: "asc" },
  });

  if (!sampleItem?.photo) {
    return {
      ok: false,
      message: "No inventory photos available for sample query",
      extensionInstalled: true,
      indexedCount,
    };
  }

  const buffer = await loadPhotoBuffer(sampleItem.photo);
  if (!buffer) {
    return {
      ok: false,
      message: "Could not load sample item photo for pgvector query test",
      extensionInstalled: true,
      indexedCount,
    };
  }

  const embedding = await generateInventoryImageEmbedding(buffer);
  const search = await searchInventoryByPgvector(embedding.vector, 5);
  if (!search.ok) {
    return {
      ok: false,
      message: search.reason,
      extensionInstalled: true,
      indexedCount,
    };
  }

  return {
    ok: true,
    message: `pgvector OK — ${indexedCount} indexed, sample query returned ${search.candidates.length} hits`,
    extensionInstalled: true,
    indexedCount,
    sampleQueryMs: search.elapsedMs,
    sampleHits: search.candidates.length,
  };
}

export async function runEmbeddingTest(itemId?: number): Promise<{
  ok: boolean;
  message: string;
  itemId: number | null;
  modelId?: string;
  dimension?: number;
  latencyMs?: number;
}> {
  let targetId = itemId;
  if (!targetId) {
    const first = await prisma.clothingItem.findFirst({
      where: { photo: { not: null }, NOT: { photo: "" } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    targetId = first?.id;
  }
  if (!targetId) {
    return { ok: false, message: "No inventory item with a photo found", itemId: null };
  }

  const item = await prisma.clothingItem.findUnique({
    where: { id: targetId },
    select: { id: true, photo: true },
  });
  if (!item?.photo) {
    return { ok: false, message: `Item ${targetId} has no photo`, itemId: targetId };
  }

  const buffer = await loadPhotoBuffer(item.photo);
  if (!buffer) {
    return { ok: false, message: `Could not load photo for item ${targetId}`, itemId: targetId };
  }

  const started = Date.now();
  try {
    const result = await generateInventoryImageEmbedding(buffer);
    const latencyMs = Date.now() - started;
    return {
      ok: true,
      message: `Embedding OK — ${result.modelId} (${result.vector.length}-d) in ${latencyMs}ms`,
      itemId: targetId,
      modelId: result.modelId,
      dimension: result.vector.length,
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Embedding test failed",
      itemId: targetId,
      latencyMs: Date.now() - started,
    };
  }
}

export async function runItemSearchTest(itemId: number): Promise<ItemSearchTestResult> {
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { id: true, photo: true, category: true },
  });
  if (!item?.photo) {
    return {
      ok: false,
      itemId,
      searchEngine: "none",
      processingTimeMs: 0,
      selfRank: null,
      topMatches: [],
      error: "Item has no photo",
    };
  }

  const buffer = await loadPhotoBuffer(item.photo);
  if (!buffer) {
    return {
      ok: false,
      itemId,
      searchEngine: "none",
      processingTimeMs: 0,
      selfRank: null,
      topMatches: [],
      error: "Could not load item photo",
    };
  }

  try {
    const result = await searchInventoryByDressCheckerEnterprise(
      buffer,
      { category: item.category || "" },
      { debug: true, limit: 5 },
    );
    const topMatches: SearchTestMatch[] = result.results.slice(0, 5).map((r, i) => ({
      itemId: r.id,
      sku: r.sku,
      name: r.display_name || r.name,
      vectorSimilarity: r.vector_similarity ?? r.embedding_score ?? 0,
      openAiScore: r.openai_score ?? 0,
      finalScore: r.similarity ?? 0,
      rank: i + 1,
    }));
    const selfRank = topMatches.find((m) => m.itemId === itemId)?.rank ?? null;

    return {
      ok: true,
      itemId,
      searchEngine: result.search_engine,
      processingTimeMs: result.processing_time_ms,
      selfRank,
      topMatches,
    };
  } catch (err) {
    return {
      ok: false,
      itemId,
      searchEngine: "error",
      processingTimeMs: 0,
      selfRank: null,
      topMatches: [],
      error: err instanceof Error ? err.message : "Search test failed",
    };
  }
}
