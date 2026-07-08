import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import prisma from "./prisma";
import { logDressChecker } from "./dressCheckerLog";
import { DRESS_CHECKER_CORRECTIONS_DIR } from "./dressCheckerConstants";
import type { DressCheckerCorrectionInput } from "./dressCheckerTypes";
import { recordRecognitionFeedback } from "./recognitionPipeline/feedbackStore";

export async function saveCorrectionPhoto(buffer: Buffer): Promise<string> {
  const filename = `${randomUUID().replace(/-/g, "")}.jpg`;
  const rel = `${DRESS_CHECKER_CORRECTIONS_DIR}/${filename}`;
  const dir = join(process.cwd(), "public", "uploads", DRESS_CHECKER_CORRECTIONS_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return rel;
}

/** Add staff-confirmed photo as a reference image and reprocess AI profile. */
async function learnFromPositiveCorrection(itemId: number, photoRelPath: string): Promise<void> {
  const maxOrder = await prisma.clothingItemReferencePhoto.aggregate({
    where: { itemId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;
  const label = `staff_confirmed_${new Date().toISOString().slice(0, 10)}`;

  await prisma.clothingItemReferencePhoto.create({
    data: {
      itemId,
      photo: photoRelPath,
      label,
      sortOrder,
    },
  });

  const { scheduleInventoryAiProfile } = await import("./dressChecker/processInventory");
  scheduleInventoryAiProfile(itemId, "staff_correction");
}

export async function recordDressCheckerCorrection(
  input: DressCheckerCorrectionInput,
  photoBuffer: Buffer,
  correctedBy?: string,
) {
  const feedbackType = input.feedbackType ?? (input.correctItemId ? "positive" : "negative");
  const row = await recordRecognitionFeedback(
    {
      correctItemId: input.correctItemId,
      rejectedItemId: input.rejectedItemId,
      predictedItemId: input.predictedItemId,
      predictedSku: input.predictedSku,
      confidence: input.confidence,
      hybridScore: input.hybridScore,
      featureComparison: input.featureComparison as import("./recognitionPipeline/types").HybridComponentScores | null,
      searchId: input.searchId,
      feedbackType,
    },
    photoBuffer,
    correctedBy,
  );

  if (feedbackType === "positive" && input.correctItemId && row.uploadedPhoto) {
    await learnFromPositiveCorrection(input.correctItemId, row.uploadedPhoto);
  }

  logDressChecker({
    timestamp: new Date().toISOString(),
    event: "correction",
    itemId: input.correctItemId ?? input.rejectedItemId ?? undefined,
    sku: row.correctItem.sku,
    topPredictionSku: input.predictedSku ?? undefined,
    topConfidence: input.confidence ?? undefined,
    reason: feedbackType === "negative" ? "staff_rejected_suggestion" : "staff_manual_correction",
  });

  return row;
}

export async function exportDressCheckerCorrections() {
  return prisma.dressCheckerCorrection.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      correctItem: { select: { id: true, sku: true, name: true, category: true } },
      predictedItem: { select: { id: true, sku: true, name: true } },
    },
  });
}
