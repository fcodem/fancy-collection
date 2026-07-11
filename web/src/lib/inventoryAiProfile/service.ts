import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { toCustomerSafeProfile, toInternalProfile } from "./effectiveProfile";

const profileInclude = {
  tags: { orderBy: { tag: "asc" as const } },
  override: true,
  versions: { orderBy: { version: "desc" as const }, take: 20 },
  logs: { orderBy: { createdAt: "desc" as const }, take: 50 },
} as const;

export async function fetchAiProfile(itemId: number, internal = false) {
  const profile = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    include: profileInclude,
  });

  if (!profile) {
    const item = await prisma.clothingItem.findUnique({
      where: { id: itemId },
      select: { id: true, photo: true },
    });
    if (!item) return null;
    const empty = {
      itemId,
      status: item.photo ? "pending" : "none",
      description: null,
      searchText: null,
      colourAnalysis: null,
      garmentAttributes: null,
      jewelleryAttributes: null,
      qualityScores: null,
      healthScore: null,
      healthIssues: [],
      indexedAt: null,
      currentVersion: 0,
      pipelineVersion: "1",
      duplicateFingerprint: null,
      enhancedImage: null,
      enhancementStatus: "none",
      enhancementVersion: 0,
      enhancementModel: null,
      enhancementLatencyMs: null,
      tags: [],
      override: null,
      versions: [],
      logs: [],
    };
    return internal ? toInternalProfile(empty) : toCustomerSafeProfile(empty);
  }

  const latestVersion = profile.versions[0];
  const row = {
    itemId: profile.itemId,
    status: profile.status,
    description: profile.description,
    searchText: profile.searchText,
    colourAnalysis: profile.colourAnalysis,
    garmentAttributes: profile.garmentAttributes,
    jewelleryAttributes: profile.jewelleryAttributes,
    qualityScores: profile.qualityScores,
    healthScore: profile.healthScore,
    healthIssues: profile.healthIssues,
    indexedAt: profile.indexedAt,
    currentVersion: profile.currentVersion,
    pipelineVersion: profile.pipelineVersion,
    duplicateFingerprint: profile.duplicateFingerprint,
    enhancedImage: profile.enhancedImage,
    enhancementStatus: profile.enhancementStatus,
    enhancementVersion: profile.enhancementVersion,
    enhancementModel: profile.enhancementModel,
    enhancementLatencyMs: profile.enhancementLatencyMs,
    tags: profile.tags,
    override: profile.override,
    versions: profile.versions,
    logs: profile.logs,
    embeddings: internal && latestVersion ? latestVersion.embeddings : undefined,
    featureFingerprint: internal && latestVersion ? latestVersion.featureFingerprint : undefined,
  };

  return internal ? toInternalProfile(row) : toCustomerSafeProfile(row);
}

export async function saveProfileOverrides(
  itemId: number,
  data: {
    description?: string | null;
    tags?: string[];
    colourAnalysis?: Record<string, unknown> | null;
    garmentAttributes?: Record<string, unknown> | null;
    jewelleryAttributes?: Record<string, unknown> | null;
    category?: string | null;
    subCategory?: string | null;
    qualityNotes?: string | null;
  },
  updatedBy: string,
) {
  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: { itemId, status: "none" },
    update: {},
  });

  await prisma.inventoryAiProfileOverride.upsert({
    where: { itemId },
    create: {
      itemId,
      description: data.description ?? null,
      tags: data.tags ? (data.tags as Prisma.InputJsonValue) : undefined,
      colourAnalysis: data.colourAnalysis ? (data.colourAnalysis as Prisma.InputJsonValue) : undefined,
      garmentAttributes: data.garmentAttributes ? (data.garmentAttributes as Prisma.InputJsonValue) : undefined,
      jewelleryAttributes: data.jewelleryAttributes ? (data.jewelleryAttributes as Prisma.InputJsonValue) : undefined,
      category: data.category ?? null,
      subCategory: data.subCategory ?? null,
      qualityNotes: data.qualityNotes ?? null,
      updatedBy,
    },
    update: {
      description: data.description ?? null,
      tags: data.tags ? (data.tags as Prisma.InputJsonValue) : undefined,
      colourAnalysis: data.colourAnalysis ? (data.colourAnalysis as Prisma.InputJsonValue) : undefined,
      garmentAttributes: data.garmentAttributes ? (data.garmentAttributes as Prisma.InputJsonValue) : undefined,
      jewelleryAttributes: data.jewelleryAttributes ? (data.jewelleryAttributes as Prisma.InputJsonValue) : undefined,
      category: data.category ?? null,
      subCategory: data.subCategory ?? null,
      qualityNotes: data.qualityNotes ?? null,
      updatedBy,
    },
  });

  if (data.tags) {
    await prisma.inventoryAiProfileTag.deleteMany({ where: { itemId, source: "manual" } });
    if (data.tags.length) {
      await prisma.inventoryAiProfileTag.createMany({
        data: data.tags.map((tag) => ({ itemId, tag, source: "manual" })),
        skipDuplicates: true,
      });
    }
  }

  return fetchAiProfile(itemId, true);
}
