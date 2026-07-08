import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import prisma from "../prisma";
import { DRESS_CHECKER_CORRECTIONS_DIR } from "../dressCheckerConstants";
import type { HybridComponentScores } from "./types";

export type FeedbackInput = {
  correctItemId?: number | null;
  rejectedItemId?: number | null;
  predictedItemId?: number | null;
  predictedSku?: string | null;
  confidence?: number | null;
  hybridScore?: number | null;
  featureComparison?: HybridComponentScores | null;
  searchId?: string | null;
  feedbackType: "positive" | "negative";
};

async function saveFeedbackPhoto(buffer: Buffer): Promise<string> {
  const filename = `${randomUUID().replace(/-/g, "")}.jpg`;
  const rel = `${DRESS_CHECKER_CORRECTIONS_DIR}/${filename}`;
  const dir = join(process.cwd(), "public", "uploads", DRESS_CHECKER_CORRECTIONS_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return rel;
}

export async function recordRecognitionFeedback(
  input: FeedbackInput,
  photoBuffer: Buffer,
  correctedBy?: string,
) {
  const uploadedPhoto = await saveFeedbackPhoto(photoBuffer);

  if (input.feedbackType === "positive" && input.correctItemId) {
    return prisma.dressCheckerCorrection.create({
      data: {
        correctItemId: input.correctItemId,
        predictedItemId: input.predictedItemId ?? null,
        predictedSku: input.predictedSku ?? null,
        confidence: input.confidence ?? null,
        hybridScore: input.hybridScore ?? null,
        featureComparison: input.featureComparison ?? undefined,
        feedbackType: "positive",
        rejectedItemId: null,
        uploadedPhoto,
        correctedBy: correctedBy ?? null,
        searchId: input.searchId ?? null,
      },
      include: {
        correctItem: { select: { sku: true, name: true } },
      },
    });
  }

  if (input.feedbackType === "negative" && input.rejectedItemId) {
    return prisma.dressCheckerCorrection.create({
      data: {
        correctItemId: input.rejectedItemId,
        predictedItemId: input.predictedItemId ?? input.rejectedItemId,
        predictedSku: input.predictedSku ?? null,
        confidence: input.confidence ?? null,
        hybridScore: input.hybridScore ?? null,
        featureComparison: input.featureComparison ?? undefined,
        feedbackType: "negative",
        rejectedItemId: input.rejectedItemId,
        uploadedPhoto,
        correctedBy: correctedBy ?? null,
        searchId: input.searchId ?? null,
      },
      include: {
        correctItem: { select: { sku: true, name: true } },
      },
    });
  }

  throw new Error("Invalid feedback input");
}

/** Soft ranking boost from past positive corrections with similar feature profiles. */
export async function correctionBoostForItem(itemId: number): Promise<number> {
  const count = await prisma.dressCheckerCorrection.count({
    where: { correctItemId: itemId, feedbackType: "positive" },
  });
  return Math.min(5, count);
}
