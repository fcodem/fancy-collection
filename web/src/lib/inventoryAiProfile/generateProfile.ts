import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { loadPhotoBuffer } from "../services/siglipSearch";
import { recognitionPhotoRef } from "../catalogPhotoRef";
import type { RecognitionFingerprint } from "../recognitionFingerprint";
import { SIGLIP_MODEL_ID } from "../siglipPreprocess";
import {
  AI_PROFILE_PIPELINE_VERSION,
  AI_PROFILE_VISION_MODEL,
} from "./constants";
import { analyseImageColours, buildColourAnalysis } from "./colourAnalysis";
import { snapshotEmbeddings } from "./embeddings";
import { buildDuplicateFingerprint } from "./duplicateFingerprint";
import { computeHealthScore } from "./healthScore";
import { scoreImageQuality } from "./qualityScoring";
import { buildSearchText } from "./searchIndex";
import { generateVisionMetadata } from "./visionMetadata";
import type { SourceImages } from "./types";

export type ProfileGenerateMode = "full" | "embeddings" | "fingerprints" | "metadata";

export async function logProfileEvent(
  itemId: number,
  event: string,
  message?: string,
  options: { version?: number; modelVersion?: string; durationMs?: number; retryCount?: number } = {},
) {
  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: { itemId, status: "none" },
    update: {},
  });
  await prisma.inventoryAiProfileLog.create({
    data: {
      itemId,
      event,
      message: message ?? null,
      version: options.version ?? null,
      modelVersion: options.modelVersion ?? null,
      durationMs: options.durationMs ?? null,
      retryCount: options.retryCount ?? null,
    },
  });
}

async function syncProfileTags(itemId: number, tags: string[]) {
  await prisma.inventoryAiProfileTag.deleteMany({ where: { itemId, source: "ai" } });
  if (!tags.length) return;
  await prisma.inventoryAiProfileTag.createMany({
    data: tags.map((tag) => ({ itemId, tag, source: "ai" })),
    skipDuplicates: true,
  });
}

export async function generateInventoryAiProfile(
  itemId: number,
  mode: ProfileGenerateMode = "full",
  reason = "scheduled",
): Promise<void> {
  const started = Date.now();
  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      category: true,
      itemType: true,
      photo: true,
      recognitionImage: true,
      recognitionFingerprint: true,
      identificationIndex: true,
      identificationIndexedAt: true,
      siglipEmbedding: true,
      aiProfile: { select: { currentVersion: true } },
    },
  });

  if (!item) return;

  const hasPhoto = !!item.photo;
  if (!hasPhoto) {
    await prisma.inventoryAiProfile.upsert({
      where: { itemId },
      create: { itemId, status: "none" },
      update: { status: "none", error: null },
    });
    return;
  }

  await prisma.inventoryAiProfile.upsert({
    where: { itemId },
    create: { itemId, status: "processing", pipelineVersion: AI_PROFILE_PIPELINE_VERSION },
    update: { status: "processing", error: null, pipelineVersion: AI_PROFILE_PIPELINE_VERSION },
  });
  await logProfileEvent(itemId, "processing", `Started (${reason})`);

  try {
    const sourceImages: SourceImages = {
      original: item.photo,
      recognition: item.recognitionImage,
    };

    const recPath = recognitionPhotoRef(item);
    const imageBuf = recPath ? await loadPhotoBuffer(recPath) : null;
    if (!imageBuf) throw new Error("Could not load recognition image for profile generation");

    const recognitionFp = item.recognitionFingerprint as RecognitionFingerprint | null;
    const embeddings = snapshotEmbeddings(item);

    let colourAnalysis = buildColourAnalysis(recognitionFp, await analyseImageColours(imageBuf));
    let vision = {
      description: "",
      tags: [] as string[],
      garmentAttributes: {} as Record<string, unknown>,
      jewelleryAttributes: {} as Record<string, unknown>,
    };

    const runMetadata = mode === "full" || mode === "metadata";
    const runFingerprints = mode === "full" || mode === "fingerprints";
    const runEmbeddings = mode === "full" || mode === "embeddings";

    if (runMetadata) {
      const imageHints = await analyseImageColours(imageBuf);
      const meta = await generateVisionMetadata(imageBuf, item.category, item.itemType, imageHints);
      vision = {
        description: meta.description,
        tags: meta.tags,
        garmentAttributes: meta.garmentAttributes,
        jewelleryAttributes: meta.jewelleryAttributes,
      };
      colourAnalysis = buildColourAnalysis(recognitionFp, imageHints, meta.colourHints);
    } else {
      const existing = await prisma.inventoryAiProfile.findUnique({
        where: { itemId },
        select: { description: true, colourAnalysis: true, garmentAttributes: true, jewelleryAttributes: true },
      });
      if (existing?.description) vision.description = existing.description;
      if (existing?.colourAnalysis) colourAnalysis = existing.colourAnalysis as typeof colourAnalysis;
      if (existing?.garmentAttributes) vision.garmentAttributes = existing.garmentAttributes as Record<string, unknown>;
      if (existing?.jewelleryAttributes) vision.jewelleryAttributes = existing.jewelleryAttributes as Record<string, unknown>;
      const existingTags = await prisma.inventoryAiProfileTag.findMany({
        where: { itemId, source: "ai" },
        select: { tag: true },
      });
      vision.tags = existingTags.map((t) => t.tag);
    }

    const qualityScores = runMetadata
      ? await scoreImageQuality(imageBuf, {
          hasRecognitionImage: !!item.recognitionImage,
        })
      : null;

    const duplicateFingerprint = runFingerprints
      ? buildDuplicateFingerprint(recognitionFp, embeddings)
      : null;

    const featureFingerprint = recognitionFp as unknown as Prisma.InputJsonValue;

    const nextVersion = (item.aiProfile?.currentVersion ?? 0) + 1;
    const tags = vision.tags;
    const searchText = buildSearchText({
      name: item.name,
      category: item.category,
      description: vision.description,
      tags,
      colourAnalysis,
      garmentAttributes: vision.garmentAttributes,
      jewelleryAttributes: vision.jewelleryAttributes,
    });

    const { score: healthScore, issues: healthIssues } = computeHealthScore({
      hasPhoto: true,
      sourceImages,
      qualityScores,
      colourAnalysis,
      garmentAttributes: vision.garmentAttributes as never,
      description: vision.description,
      tags,
      duplicateFingerprint,
      identificationIndexedAt: item.identificationIndexedAt,
      recognitionImage: item.recognitionImage,
      profileStatus: "processing",
    });

    if (runEmbeddings || runMetadata || runFingerprints) {
      await prisma.inventoryAiProfileVersion.create({
        data: {
          itemId,
          version: nextVersion,
          embeddingModel: SIGLIP_MODEL_ID,
          embeddingModelVersion: AI_PROFILE_PIPELINE_VERSION,
          visionModel: runMetadata ? AI_PROFILE_VISION_MODEL : null,
          pipelineVersion: AI_PROFILE_PIPELINE_VERSION,
          embeddings: runEmbeddings ? (embeddings as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          featureFingerprint: runFingerprints ? featureFingerprint : Prisma.JsonNull,
          duplicateFingerprint: duplicateFingerprint as unknown as Prisma.InputJsonValue,
          colourAnalysis: colourAnalysis as unknown as Prisma.InputJsonValue,
          garmentAttributes: vision.garmentAttributes as unknown as Prisma.InputJsonValue,
          jewelleryAttributes: vision.jewelleryAttributes as unknown as Prisma.InputJsonValue,
          qualityScores: qualityScores as unknown as Prisma.InputJsonValue,
          description: vision.description || null,
          tagsSnapshot: vision.tags,
          sourceImages: sourceImages as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await prisma.inventoryAiProfile.update({
      where: { itemId },
      data: {
        status: "completed",
        error: null,
        currentVersion: nextVersion,
        indexedAt: new Date(),
        description: vision.description || null,
        searchText,
        colourAnalysis: colourAnalysis as unknown as Prisma.InputJsonValue,
        garmentAttributes: vision.garmentAttributes as unknown as Prisma.InputJsonValue,
        jewelleryAttributes: vision.jewelleryAttributes as unknown as Prisma.InputJsonValue,
        qualityScores: qualityScores as unknown as Prisma.InputJsonValue,
        duplicateFingerprint: duplicateFingerprint as unknown as Prisma.InputJsonValue,
        healthScore,
        healthIssues: healthIssues as unknown as Prisma.InputJsonValue,
      },
    });

    if (runMetadata) {
      await syncProfileTags(itemId, tags);
    }

    const ms = Date.now() - started;
    await logProfileEvent(itemId, "completed", `v${nextVersion} · ${mode}`, {
      version: nextVersion,
      modelVersion: AI_PROFILE_VISION_MODEL,
      durationMs: ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Profile generation failed";
    await prisma.inventoryAiProfile.update({
      where: { itemId },
      data: { status: "failed", error: message },
    }).catch(() => {});
    await logProfileEvent(itemId, "failed", message, { durationMs: Date.now() - started });
    throw err;
  }
}

export async function resetInventoryAiProfile(itemId: number): Promise<void> {
  await prisma.inventoryAiProfileTag.deleteMany({ where: { itemId } });
  await prisma.inventoryAiProfileOverride.deleteMany({ where: { itemId } });
  await prisma.inventoryAiProfile.updateMany({
    where: { itemId },
    data: {
      status: "none",
      error: null,
      description: null,
      searchText: null,
      colourAnalysis: Prisma.JsonNull,
      garmentAttributes: Prisma.JsonNull,
      jewelleryAttributes: Prisma.JsonNull,
      qualityScores: Prisma.JsonNull,
      duplicateFingerprint: Prisma.JsonNull,
      healthScore: null,
      healthIssues: Prisma.JsonNull,
    },
  });
  await logProfileEvent(itemId, "reset", "Photo removed");
}
