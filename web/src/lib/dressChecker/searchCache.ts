/**
 * In-process caches for Dress Checker search — cut duplicate SigLIP / OpenAI work.
 * Keyed by content hashes; bounded LRU-ish maps.
 */
import { createHash } from "crypto";

const MAX_ENTRIES = 64;

type CacheEntry<T> = { value: T; at: number };

function touchMap<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): T {
  map.set(key, { value, at: Date.now() });
  if (map.size > MAX_ENTRIES) {
    const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) map.delete(oldest[0]);
  }
  return value;
}

function getMap<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  hit.at = Date.now();
  return hit.value;
}

export function hashImageBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 32);
}

const queryEmbeddingCache = new Map<string, CacheEntry<number[]>>();
const openaiVerdictCache = new Map<string, CacheEntry<unknown>>();
const queryAnalysisCache = new Map<string, CacheEntry<unknown>>();

export type SearchCacheStats = {
  embeddingHits: number;
  embeddingMisses: number;
  openaiHits: number;
  openaiMisses: number;
  analysisHits: number;
  analysisMisses: number;
};

const stats: SearchCacheStats = {
  embeddingHits: 0,
  embeddingMisses: 0,
  openaiHits: 0,
  openaiMisses: 0,
  analysisHits: 0,
  analysisMisses: 0,
};

export function getSearchCacheStats(): SearchCacheStats {
  return { ...stats };
}

export function getCachedQueryEmbedding(imageHash: string): number[] | null {
  const v = getMap(queryEmbeddingCache, imageHash);
  if (v) {
    stats.embeddingHits += 1;
    return v;
  }
  stats.embeddingMisses += 1;
  return null;
}

export function setCachedQueryEmbedding(imageHash: string, embedding: number[]): void {
  touchMap(queryEmbeddingCache, imageHash, embedding);
}

export function getCachedQueryAnalysis<T>(imageHash: string): T | null {
  const v = getMap(queryAnalysisCache, imageHash) as T | null;
  if (v) {
    stats.analysisHits += 1;
    return v;
  }
  stats.analysisMisses += 1;
  return null;
}

export function setCachedQueryAnalysis(imageHash: string, analysis: unknown): void {
  touchMap(queryAnalysisCache, imageHash, analysis);
}

export function openaiVerdictCacheKey(
  queryHash: string,
  candidateHashes: string[],
  promptVersion: string,
): string {
  return `${promptVersion}:${queryHash}:${candidateHashes.slice().sort().join(",")}`;
}

export function getCachedOpenAiVerdict<T>(key: string): T | null {
  const v = getMap(openaiVerdictCache, key) as T | null;
  if (v) {
    stats.openaiHits += 1;
    return v;
  }
  stats.openaiMisses += 1;
  return null;
}

export function setCachedOpenAiVerdict(key: string, verdict: unknown): void {
  touchMap(openaiVerdictCache, key, verdict);
}
