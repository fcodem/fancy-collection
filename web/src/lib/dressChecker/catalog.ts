import prisma from "../prisma";
import { parseIdentificationIndex } from "../dressIdentificationIndex";
import { parseStoredFingerprint } from "./featureExtraction";
import { parseProfileIdentificationIndex } from "./services/inventoryAiProfileService";
import type { CatalogCandidate } from "./types";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";
import type { IdentificationIndex } from "../dressIdentificationTypes";
import { IDENTIFICATION_INDEX_VERSION } from "../dressIdentificationTypes";

const EMPTY_IDENTIFICATION_INDEX: IdentificationIndex = {
  version: IDENTIFICATION_INDEX_VERSION,
  modelId: "",
  preprocessingVersion: 0,
  embeddingDimension: 768,
  contentHash: "",
  indexedAt: "",
  category: "",
  references: [],
};

export type CatalogFilters = {
  category?: string;
  size?: string;
  color?: string;
  gender?: "" | "mens" | "womens";
  status?: string;
  designer?: string;
  minPrice?: number;
  maxPrice?: number;
};

/** Lifecycle fields read via SQL — avoids stale Prisma client missing aiStatus/etc. */
type ProfileLifecycle = {
  itemId: number;
  aiStatus: string;
  needsReindex: boolean;
  matchingVersion: number;
};

async function loadProfileLifecycle(itemIds: number[]): Promise<Map<number, ProfileLifecycle>> {
  const map = new Map<number, ProfileLifecycle>();
  if (!itemIds.length) return map;

  // Use ANY($1::int[]) — Prisma.join(number[]) can bind as jsonb and cause 42883.
  const ids = itemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (!ids.length) return map;

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        item_id: number;
        ai_status: string | null;
        status: string | null;
        needs_reindex: boolean | null;
        matching_version: number | null;
      }>
    >(
      `SELECT
         p.item_id,
         p.ai_status,
         p.status,
         COALESCE(p.needs_reindex, false) AS needs_reindex,
         COALESCE(p.matching_version, 0) AS matching_version
       FROM inventory_ai_profiles p
       WHERE p.item_id = ANY($1::int[])`,
      ids,
    );

    for (const row of rows) {
      const legacy = (row.status || "").toLowerCase();
      const aiStatus = (
        row.ai_status ||
        (legacy === "ready" ? "READY" : row.status) ||
        "PENDING"
      ).toUpperCase();
      map.set(Number(row.item_id), {
        itemId: Number(row.item_id),
        aiStatus,
        needsReindex: !!row.needs_reindex,
        matchingVersion: Number(row.matching_version || 0),
      });
    }
    return map;
  } catch (err) {
    // Older DBs / partial migrations: fall back to legacy status column only.
    console.warn("[dress-checker] profile lifecycle SQL fallback:", err);
    const rows = await prisma.$queryRawUnsafe<Array<{ item_id: number; status: string | null }>>(
      `SELECT p.item_id, p.status
       FROM inventory_ai_profiles p
       WHERE p.item_id = ANY($1::int[])`,
      ids,
    );
    for (const row of rows) {
      const legacy = (row.status || "").toLowerCase();
      map.set(Number(row.item_id), {
        itemId: Number(row.item_id),
        aiStatus: legacy === "ready" ? "READY" : (row.status || "PENDING").toUpperCase(),
        needsReindex: false,
        matchingVersion: DRESS_CHECKER_FINGERPRINT_VERSION,
      });
    }
    return map;
  }
}

function isSearchableLifecycle(life: ProfileLifecycle | undefined): boolean {
  if (!life) return false;
  if (life.aiStatus !== "READY") return false;
  if (life.needsReindex) return false;
  if (life.matchingVersion < DRESS_CHECKER_FINGERPRINT_VERSION) return false;
  return true;
}

function buildWhere(filters: CatalogFilters) {
  const where: Record<string, unknown> = { photo: { not: null }, NOT: { photo: "" } };
  if (filters.category) where.category = filters.category;
  if (filters.size) where.size = filters.size;
  if (filters.color) where.color = { contains: filters.color, mode: "insensitive" };
  if (filters.status) where.status = filters.status;
  if (filters.designer) where.subCategory = { contains: filters.designer, mode: "insensitive" };
  if (filters.gender === "mens") {
    where.category = { in: ["Sherwani", "Suit", "Tuxedo", "Jodhpuri", "Indo Western", "Kurta Set", "Coat Suit"] };
  }
  if (filters.gender === "womens") {
    where.category = {
      in: ["Lehenga", "Saree", "Gown", "Sharara", "Anarkali", "Suit", "Crop Top", "Bodycon", "Reception Gown"],
    };
  }
  const rate: Record<string, number> = {};
  if (filters.minPrice != null && !Number.isNaN(filters.minPrice)) rate.gte = filters.minPrice;
  if (filters.maxPrice != null && !Number.isNaN(filters.maxPrice)) rate.lte = filters.maxPrice;
  if (Object.keys(rate).length) where.dailyRate = rate;
  return where;
}

function resolveIndex(
  profileAttrs: unknown,
  itemIndex: unknown,
): IdentificationIndex | null {
  return parseProfileIdentificationIndex(profileAttrs) || parseIdentificationIndex(itemIndex);
}

/** Shared Prisma select — only fields present on older generated clients. */
const catalogItemSelect = {
  id: true,
  name: true,
  sku: true,
  category: true,
  status: true,
  size: true,
  color: true,
  photo: true,
  recognitionImage: true,
  recognitionFingerprint: true,
  dailyRate: true,
  subCategory: true,
  identificationIndex: true,
  aiProfile: {
    select: {
      recognitionFingerprint: true,
      recognitionVersion: true,
      recognitionImage: true,
      garmentAttributes: true,
    },
  },
} as const;

export async function loadCatalogCandidates(filters: CatalogFilters = {}): Promise<{
  candidates: CatalogCandidate[];
  staleCount: number;
}> {
  const rows = await prisma.clothingItem.findMany({
    where: buildWhere(filters),
    select: catalogItemSelect,
  });

  const lifecycle = await loadProfileLifecycle(rows.map((r) => r.id));
  let staleCount = 0;
  const candidates: CatalogCandidate[] = [];

  for (const item of rows) {
    const life = lifecycle.get(item.id);
    if (!isSearchableLifecycle(life)) {
      if (life && life.aiStatus !== "READY") staleCount++;
      continue;
    }

    const index = resolveIndex(item.aiProfile?.garmentAttributes, item.identificationIndex);
    if (!index?.references?.length) continue;

    const fp =
      parseStoredFingerprint(item.aiProfile?.recognitionFingerprint, item.name, item.color) ||
      parseStoredFingerprint(item.recognitionFingerprint, item.name, item.color);

    if ((item.aiProfile?.recognitionVersion ?? 0) < DRESS_CHECKER_FINGERPRINT_VERSION) staleCount++;

    const primaryRef = index.references[0];

    candidates.push({
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      subCategory: item.subCategory,
      color: item.color,
      status: item.status,
      size: item.size || "",
      photo: item.photo,
      recognitionImage: item.aiProfile?.recognitionImage || item.recognitionImage,
      dailyRate: item.dailyRate,
      fingerprint: fp,
      identificationIndex: index ?? EMPTY_IDENTIFICATION_INDEX,
      references: index?.references ?? [],
      embeddings: primaryRef?.embeddings ?? null,
      embeddingScore: 0,
      viewCount: index.references.length,
    });
  }

  return { candidates, staleCount };
}

/** Load identity-indexed candidates for a pgvector shortlist only. */
export async function loadCatalogCandidatesByIds(
  itemIds: number[],
): Promise<Map<number, CatalogCandidate>> {
  if (!itemIds.length) return new Map();

  const lifecycle = await loadProfileLifecycle(itemIds);
  const readyIds = itemIds.filter((id) => isSearchableLifecycle(lifecycle.get(id)));
  if (!readyIds.length) return new Map();

  const rows = await prisma.clothingItem.findMany({
    where: { id: { in: readyIds } },
    select: catalogItemSelect,
  });

  const map = new Map<number, CatalogCandidate>();
  for (const item of rows) {
    const index = resolveIndex(item.aiProfile?.garmentAttributes, item.identificationIndex);
    const fp =
      parseStoredFingerprint(item.aiProfile?.recognitionFingerprint, item.name, item.color) ||
      parseStoredFingerprint(item.recognitionFingerprint, item.name, item.color);
    const primaryRef = index?.references?.[0];
    map.set(item.id, {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      subCategory: item.subCategory,
      color: item.color,
      status: item.status,
      size: item.size || "",
      photo: item.photo,
      recognitionImage: item.aiProfile?.recognitionImage || item.recognitionImage,
      dailyRate: item.dailyRate,
      fingerprint: fp,
      identificationIndex: index ?? EMPTY_IDENTIFICATION_INDEX,
      references: index?.references ?? [],
      embeddings: primaryRef?.embeddings ?? null,
      embeddingScore: 0,
      viewCount: index?.references.length ?? 0,
    });
  }
  return map;
}
