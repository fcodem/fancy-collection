import prisma from "../prisma";
import { parseIdentificationIndex } from "../dressIdentificationIndex";
import { parseStoredFingerprint } from "./featureExtraction";
import { parseProfileIdentificationIndex } from "./services/inventoryAiProfileService";
import type { CatalogCandidate } from "./types";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "./types";
import type { IdentificationIndex } from "../dressIdentificationTypes";

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

export async function loadCatalogCandidates(filters: CatalogFilters = {}): Promise<{
  candidates: CatalogCandidate[];
  staleCount: number;
}> {
  const rows = await prisma.clothingItem.findMany({
    where: buildWhere(filters),
    select: {
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
    },
  });

  let staleCount = 0;
  const candidates: CatalogCandidate[] = [];

  for (const item of rows) {
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
      identificationIndex: index,
      references: index.references,
      embeddings: primaryRef?.embeddings ?? null,
      embeddingScore: 0,
      viewCount: index.references.length,
    });
  }

  return { candidates, staleCount };
}
