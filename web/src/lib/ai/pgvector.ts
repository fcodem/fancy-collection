import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { SIGLIP_EMBEDDING_DIM } from "@/lib/siglipPreprocess";
import {
  classifyVectorFailureCode,
  type DressCheckerIssueCode,
} from "@/lib/dressChecker/searchHealth";
import { searchableProfileSql } from "@/lib/dressChecker/profileReadiness";
import {
  buildCategoryFilterSql,
  type CategorySearchScope,
} from "@/lib/dressChecker/categorySearchScope";

export const PGVECTOR_SEARCH_DEFAULT_LIMIT = Number(process.env.DRESS_CHECKER_ANN_RECALL_K || 100);

function readyProfileSql(): string {
  return searchableProfileSql("p");
}

function toVectorLiteral(values: number[]): string {
  if (values.length !== SIGLIP_EMBEDDING_DIM) {
    throw new Error(`Expected ${SIGLIP_EMBEDDING_DIM}-d embedding, got ${values.length}`);
  }
  return `[${values.map((v) => Number(v).toFixed(8)).join(",")}]`;
}

function normalizeScope(
  categoryOrScope?: string | CategorySearchScope,
  subCategory?: string,
): CategorySearchScope {
  if (categoryOrScope && typeof categoryOrScope === "object") {
    return {
      category: categoryOrScope.category?.trim() || undefined,
      subCategory: categoryOrScope.subCategory?.trim() || undefined,
    };
  }
  return {
    category: (categoryOrScope || "").trim() || undefined,
    subCategory: (subCategory || "").trim() || undefined,
  };
}

export async function isPgvectorAvailable(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_extension WHERE extname = 'vector'
       ) AS exists`,
    );
    if (!rows[0]?.exists) return false;
    const cols = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'inventory_ai_profiles' AND column_name = 'embedding_vector'
       ) AS exists`,
    );
    return !!cols[0]?.exists;
  } catch {
    return false;
  }
}

export async function countIndexedPgvectorEmbeddings(
  categoryOrScope?: string | CategorySearchScope,
  subCategory?: string,
): Promise<number> {
  const pgOk = await isPgvectorAvailable();
  if (!pgOk) return 0;
  const scope = normalizeScope(categoryOrScope, subCategory);
  const filter = buildCategoryFilterSql(scope, 1);
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count
     FROM inventory_ai_profiles p
     JOIN clothing_items c ON c.id = p.item_id
     WHERE ${readyProfileSql()}
       AND c.photo IS NOT NULL AND c.photo <> ''
       ${filter.sql}`,
    ...filter.params,
  );
  return rows[0]?.count ?? 0;
}

export async function upsertInventoryEmbeddingVector(
  itemId: number,
  embedding: number[],
): Promise<void> {
  if (!embedding.length) return;
  const ok = await isPgvectorAvailable();
  if (!ok) {
    throw new Error("pgvector extension or embedding_vector column is not available");
  }
  const literal = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `UPDATE inventory_ai_profiles SET embedding_vector = $1::vector WHERE item_id = $2`,
    literal,
    itemId,
  );
}

export async function isReferencePhotoPgvectorAvailable(): Promise<boolean> {
  try {
    const pgOk = await isPgvectorAvailable();
    if (!pgOk) return false;
    const cols = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'clothing_item_reference_photos' AND column_name = 'embedding_vector'
       ) AS exists`,
    );
    return !!cols[0]?.exists;
  } catch {
    return false;
  }
}

export async function upsertReferencePhotoEmbeddingVector(
  refPhotoId: number,
  embedding: number[],
): Promise<void> {
  if (!embedding.length) return;
  const ok = await isReferencePhotoPgvectorAvailable();
  if (!ok) return;
  const literal = toVectorLiteral(embedding);
  await prisma.$executeRawUnsafe(
    `UPDATE clothing_item_reference_photos SET embedding_vector = $1::vector WHERE id = $2`,
    literal,
    refPhotoId,
  );
}

export type VectorCandidate = {
  itemId: number;
  distance: number;
  similarity: number;
  category?: string;
  subCategory?: string | null;
};

export type PgvectorSearchSuccess = {
  ok: true;
  candidates: VectorCandidate[];
  elapsedMs: number;
  indexedCount: number;
  indexedCountBeforeFilter: number;
  indexedCountAfterFilter: number;
  limit: number;
  scope: CategorySearchScope;
};

export type PgvectorSearchFailure = {
  ok: false;
  code: DressCheckerIssueCode;
  reason: string;
  elapsedMs: number;
  indexedCount: number;
  indexedCountBeforeFilter: number;
  indexedCountAfterFilter: number;
  scope: CategorySearchScope;
};

export type PgvectorSearchResult = PgvectorSearchSuccess | PgvectorSearchFailure;

function distanceToSimilarityPercent(distance: number): number {
  return Math.max(0, Math.min(100, (1 - Number(distance || 1)) * 100));
}

/**
 * pgvector cosine search — category/subcategory filters applied in SQL
 * before ORDER BY similarity (never post-filter after ANN).
 */
export async function searchInventoryByPgvector(
  embedding: number[],
  limit = PGVECTOR_SEARCH_DEFAULT_LIMIT,
  categoryOrScope?: string | CategorySearchScope,
  subCategory?: string,
): Promise<PgvectorSearchResult> {
  const started = Date.now();
  const scope = normalizeScope(categoryOrScope, subCategory);

  if (!embedding.length) {
    const reason = "Query embedding is empty — image embedding generation failed";
    console.error(`[dress-checker] PGVECTOR BLOCKED code=QUERY_EMBEDDING_FAILED reason=${reason}`);
    return {
      ok: false,
      code: classifyVectorFailureCode(reason),
      reason,
      elapsedMs: Date.now() - started,
      indexedCount: 0,
      indexedCountBeforeFilter: 0,
      indexedCountAfterFilter: 0,
      scope,
    };
  }

  const pgOk = await isPgvectorAvailable();
  if (!pgOk) {
    const reason =
      "pgvector is not available (extension or embedding_vector column missing). Run migrations and install pgvector.";
    console.error(`[dress-checker] PGVECTOR BLOCKED code=PGVECTOR_MISSING reason=${reason}`);
    return {
      ok: false,
      code: classifyVectorFailureCode(reason),
      reason,
      elapsedMs: Date.now() - started,
      indexedCount: 0,
      indexedCountBeforeFilter: 0,
      indexedCountAfterFilter: 0,
      scope,
    };
  }

  const indexedCountBeforeFilter = await countIndexedPgvectorEmbeddings();
  const indexedCountAfterFilter = await countIndexedPgvectorEmbeddings(scope);
  const indexedCount = indexedCountAfterFilter;

  if (indexedCount === 0) {
    const label = [scope.category, scope.subCategory].filter(Boolean).join(" > ");
    const reason = label
      ? `No inventory items have pgvector embeddings in "${label}"`
      : "No inventory items have pgvector embeddings indexed";
    const code = classifyVectorFailureCode(reason, scope.category);
    console.error(`[dress-checker] PGVECTOR BLOCKED code=${code} reason=${reason}`);
    return {
      ok: false,
      code,
      reason,
      elapsedMs: Date.now() - started,
      indexedCount: 0,
      indexedCountBeforeFilter,
      indexedCountAfterFilter: 0,
      scope,
    };
  }

  const literal = toVectorLiteral(embedding);
  const effectiveLimit = indexedCount <= limit ? indexedCount : limit;
  const refPgOk = await isReferencePhotoPgvectorAvailable();
  // $1 = embedding, $2 = limit, $3+ = category filters
  const filter = buildCategoryFilterSql(scope, 3);

  const rows = refPgOk
    ? await prisma.$queryRawUnsafe<
        Array<{ item_id: number; distance: number; category: string; sub_category: string | null }>
      >(
        `SELECT item_id, MIN(distance) AS distance, MAX(category) AS category, MAX(sub_category) AS sub_category
         FROM (
           SELECT p.item_id, (p.embedding_vector <=> $1::vector) AS distance,
                  c.category, c.sub_category
           FROM inventory_ai_profiles p
           JOIN clothing_items c ON c.id = p.item_id
           WHERE ${readyProfileSql()}
             AND c.photo IS NOT NULL AND c.photo <> ''
             ${filter.sql}
           UNION ALL
           SELECT r.item_id, (r.embedding_vector <=> $1::vector) AS distance,
                  c.category, c.sub_category
           FROM clothing_item_reference_photos r
           JOIN clothing_items c ON c.id = r.item_id
           JOIN inventory_ai_profiles p ON p.item_id = r.item_id
           WHERE ${readyProfileSql()}
             AND r.embedding_vector IS NOT NULL
             AND c.photo IS NOT NULL AND c.photo <> ''
             ${filter.sql}
         ) combined
         GROUP BY item_id
         ORDER BY distance
         LIMIT $2`,
        literal,
        effectiveLimit,
        ...filter.params,
      )
    : await prisma.$queryRawUnsafe<
        Array<{ item_id: number; distance: number; category: string; sub_category: string | null }>
      >(
        `SELECT p.item_id, (p.embedding_vector <=> $1::vector) AS distance,
                c.category, c.sub_category
         FROM inventory_ai_profiles p
         JOIN clothing_items c ON c.id = p.item_id
         WHERE ${readyProfileSql()}
           AND c.photo IS NOT NULL AND c.photo <> ''
           ${filter.sql}
         ORDER BY p.embedding_vector <=> $1::vector
         LIMIT $2`,
        literal,
        effectiveLimit,
        ...filter.params,
      );

  const elapsedMs = Date.now() - started;
  const candidates = rows.map((row) => ({
    itemId: Number(row.item_id),
    distance: Number(row.distance || 0),
    similarity: distanceToSimilarityPercent(Number(row.distance || 0)),
    category: row.category,
    subCategory: row.sub_category,
  }));

  if (!candidates.length) {
    const label = [scope.category, scope.subCategory].filter(Boolean).join(" > ");
    const reason = label
      ? `pgvector search returned 0 candidates for "${label}" (${indexedCount} indexed in scope)`
      : `pgvector search returned 0 candidates (${indexedCount} items indexed)`;
    const code = classifyVectorFailureCode(reason, scope.category);
    console.error(`[dress-checker] PGVECTOR BLOCKED code=${code} reason=${reason}`);
    return {
      ok: false,
      code,
      reason,
      elapsedMs,
      indexedCount,
      indexedCountBeforeFilter,
      indexedCountAfterFilter,
      scope,
    };
  }

  console.log(
    `[dress-checker] PGVECTOR SEARCH hits=${candidates.length} beforeFilter=${indexedCountBeforeFilter} afterFilter=${indexedCountAfterFilter} limit=${effectiveLimit} requested=${limit} ms=${elapsedMs} scope=${scope.category || "*"}/${scope.subCategory || "*"}`,
  );

  return {
    ok: true,
    candidates,
    elapsedMs,
    indexedCount,
    indexedCountBeforeFilter,
    indexedCountAfterFilter,
    limit: effectiveLimit,
    scope,
  };
}

/** @deprecated Use searchInventoryByPgvector for Dress Checker search. */
export async function searchNearestInventoryByVector(
  embedding: number[],
  limit = PGVECTOR_SEARCH_DEFAULT_LIMIT,
  category?: string,
): Promise<VectorCandidate[]> {
  const result = await searchInventoryByPgvector(embedding, limit, category);
  return result.ok ? result.candidates : [];
}

export type DressCheckerIndexStats = {
  totalProfiles: number;
  withEmbedding: number;
  withHash: number;
  withColorHistogram: number;
  withVerificationMetadata: number;
  withReindexedAt: number;
  ready: number;
  failed: number;
  processing: number;
};

export async function getDressCheckerIndexStats(): Promise<DressCheckerIndexStats> {
  const pgOk = await isPgvectorAvailable();
  const [total, ready, failed, processing, withHash, withColorHistogram, withVerificationMetadata, withReindexedAt] =
    await Promise.all([
      prisma.inventoryAiProfile.count(),
      prisma.inventoryAiProfile.count({ where: { aiStatus: "READY" } }),
      prisma.inventoryAiProfile.count({ where: { aiStatus: { in: ["FAILED", "STALE"] } } }),
      prisma.inventoryAiProfile.count({ where: { aiStatus: "PROCESSING" } }),
      prisma.inventoryAiProfile.count({ where: { photoHash: { not: null } } }),
      prisma.inventoryAiProfile.count({ where: { colorHistogram: { not: Prisma.DbNull } } }),
      prisma.inventoryAiProfile.count({ where: { verificationMetadata: { not: Prisma.DbNull } } }),
      prisma.inventoryAiProfile.count({ where: { reindexedAt: { not: null } } }),
    ]);

  let withEmbedding = 0;
  if (pgOk) {
    withEmbedding = await countIndexedPgvectorEmbeddings();
  }

  return {
    totalProfiles: total,
    withEmbedding,
    withHash,
    withColorHistogram,
    withVerificationMetadata,
    withReindexedAt,
    ready,
    failed,
    processing,
  };
}
