/**
 * PIPELINE 2 — Automatic Strict-Preservation Image Enhancement
 *
 * PAUSED by default — see lib/ai/enhancementFeatureFlags.ts
 * Code is kept for future re-enable. When paused, inventory upload only
 * stores the original photo and metadata is collected from that upload.
 *
 * When enabled: runs after inventory photo upload, sends originalPhoto to
 * OpenAI with a strict preservation-only prompt, stores result in enhancedPhoto.
 */
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import prisma from "@/lib/prisma";
import { loadPhotoBuffer } from "@/lib/services/siglipSearch";
import { enhanceInventoryImage } from "@/lib/ai/openaiVision";
import { buildEnhancementPrompt, enhancementStyleLabel } from "@/lib/ai/enhancementPrompts";
import { isAutoImageEnhancementEnabled } from "@/lib/ai/enhancementFeatureFlags";
import {
  formatPipelineError,
  pipelineLog,
  pipelineLogToDb,
  redactOpenAiPayload,
} from "@/lib/ai/pipelineLogger";
import { saveEnhancedImage, verifyEnhancedPath } from "@/lib/ai/enhancementStorage";
import { ensureEnhancementSchema } from "@/lib/ai/ensureEnhancementSchema";

export type EnhancementRunResult = {
  ok: boolean;
  enhancedPhoto: string | null;
  enhancementStatus: "completed" | "failed" | "skipped";
  enhancementModel: string | null;
  enhancementLatencyMs: number | null;
  enhancementError: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function saveRawOpenAiDebug(itemId: number, buffer: Buffer): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  try {
    const dir = join(process.cwd(), "public", "uploads", "enhanced", "_debug");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${itemId}-openai-raw.jpg`), buffer);
  } catch {
    // debug only — do not throw
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────
async function persistEnhancementFailure(itemId: number, message: string): Promise<void> {
  await ensureEnhancementSchema().catch((err) => {
    console.error(`[pipeline2] item=${itemId} schema ensure failed:`, err);
  });
  await prisma.clothingItem
    .update({
      where: { id: itemId },
      data: {
        enhancementStatus: "failed",
        enhancementError: message.slice(0, 4000),
        enhancementCompletedAt: new Date(),
        lastEnhancedAt: new Date(),
        enhancementUpdatedAt: new Date(),
      },
    })
    .catch((err) => {
      console.error(`[pipeline2] item=${itemId} failed to persist error:`, err);
    });
}

async function persistEnhancementSuccess(
  itemId: number,
  enhancedPhoto: string,
  model: string,
  latencyMs: number,
): Promise<void> {
  await ensureEnhancementSchema().catch((err) => {
    console.error(`[pipeline2] item=${itemId} schema ensure failed:`, err);
  });
  pipelineLog(itemId, "updating_database", enhancedPhoto);
  const now = new Date();

  await prisma.clothingItem.update({
    where: { id: itemId },
    data: {
      enhancedPhoto,
      enhancementStatus: "completed",
      enhancementError: null,
      enhancementModel: model,
      enhancementLatency: latencyMs,
      enhancementVersion: { increment: 1 },
      enhancementCompletedAt: now,
      lastEnhancedAt: now,
      enhancementUpdatedAt: now,
    },
  });

  const reloaded = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    select: { enhancedPhoto: true, enhancementStatus: true },
  });

  if (!reloaded?.enhancedPhoto) {
    throw new Error("Database reload shows enhancedPhoto is still null after update");
  }
  if (reloaded.enhancedPhoto !== enhancedPhoto) {
    throw new Error(
      `Database enhancedPhoto mismatch: expected "${enhancedPhoto}", got "${reloaded.enhancedPhoto}"`,
    );
  }

  const fileCheck = verifyEnhancedPath(reloaded.enhancedPhoto);
  if (!fileCheck.ok && !reloaded.enhancedPhoto.startsWith("http")) {
    throw new Error(`Enhanced file verification failed: ${fileCheck.reason}`);
  }

  pipelineLog(itemId, "pipeline_completed", undefined, {
    enhancedPhoto: reloaded.enhancedPhoto,
    model,
    latencyMs,
    fileBytes: fileCheck.bytes,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run Pipeline 2 — strict preservation image enhancement for one inventory item.
 *
 * Uses the originalPhoto (if available) or photo as the source image.
 * If enhancement fails for any reason, gracefully returns the original.
 */
export async function runInventoryImageEnhancement(
  itemId: number,
  item: {
    photo: string | null;
    originalPhoto?: string | null;
    category: string;
    itemType: string;
    enhancementStatus?: string;
  },
  reason = "scheduled",
): Promise<EnhancementRunResult> {
  // Feature paused — keep implementation for future use.
  if (!isAutoImageEnhancementEnabled()) {
    pipelineLog(itemId, "pipeline_skipped", `auto enhancement paused (${reason})`);
    return {
      ok: true,
      enhancedPhoto: null,
      enhancementStatus: "skipped",
      enhancementModel: null,
      enhancementLatencyMs: null,
      enhancementError: null,
    };
  }

  await ensureEnhancementSchema().catch((err) => {
    console.error(`[pipeline2] item=${itemId} schema ensure failed:`, err);
  });

  // Always source from originalPhoto first, then fall back to photo
  const sourcePhoto = item.originalPhoto || item.photo;
  if (!sourcePhoto) {
    return {
      ok: false,
      enhancedPhoto: null,
      enhancementStatus: "skipped",
      enhancementModel: null,
      enhancementLatencyMs: null,
      enhancementError: "No source photo on item",
    };
  }

  pipelineLog(itemId, "pipeline_started", reason);
  await pipelineLogToDb(itemId, "enhancement_started", reason);

  const startedAt = new Date();

  try {
    await prisma.clothingItem.update({
      where: { id: itemId },
      data: {
        enhancementStatus: "processing",
        enhancementError: null,
        enhancementStartedAt: startedAt,
      },
    });
  } catch (err) {
    const msg = formatPipelineError(err);
    pipelineLog(itemId, "pipeline_failed", `Could not set processing status: ${msg}`);
    throw err;
  }

  try {
    const imageBuf = await loadPhotoBuffer(sourcePhoto);
    if (!imageBuf?.length) {
      throw new Error(`Could not load source photo: ${sourcePhoto}`);
    }
    pipelineLog(itemId, "image_loaded", sourcePhoto, { bytes: imageBuf.length });

    const prompt = buildEnhancementPrompt(item.category, item.itemType);
    const styleLabel = enhancementStyleLabel(item.category, item.itemType);
    const requestPayload = redactOpenAiPayload({
      model: "gpt-image-1",
      styleLabel,
      promptChars: prompt.length,
      inputBytes: imageBuf.length,
      sourcePhoto,
    });
    pipelineLog(itemId, "calling_openai", styleLabel, requestPayload);
    await pipelineLogToDb(itemId, "calling_openai", JSON.stringify(requestPayload));

    const enhanced = await enhanceInventoryImage(imageBuf, prompt, itemId);
    pipelineLog(itemId, "openai_response_received", undefined, {
      model: enhanced.model,
      latencyMs: enhanced.latencyMs,
      outputBytes: enhanced.enhancedBuffer.length,
      size: enhanced.size,
    });
    await pipelineLogToDb(itemId, "openai_response_received", enhanced.model, {
      durationMs: enhanced.latencyMs,
    });

    await saveRawOpenAiDebug(itemId, enhanced.enhancedBuffer);

    const saved = await saveEnhancedImage(itemId, enhanced.enhancedBuffer);
    await persistEnhancementSuccess(itemId, saved.path, enhanced.model, enhanced.latencyMs);
    await pipelineLogToDb(itemId, "enhancement_completed", saved.path, {
      durationMs: enhanced.latencyMs,
    });

    return {
      ok: true,
      enhancedPhoto: saved.path,
      enhancementStatus: "completed",
      enhancementModel: enhanced.model,
      enhancementLatencyMs: enhanced.latencyMs,
      enhancementError: null,
    };
  } catch (err) {
    const message = formatPipelineError(err);
    pipelineLog(itemId, "pipeline_failed", message);
    await pipelineLogToDb(itemId, "enhancement_failed", message.slice(0, 2000));
    await persistEnhancementFailure(itemId, message);
    return {
      ok: false,
      enhancedPhoto: null,
      enhancementStatus: "failed",
      enhancementModel: null,
      enhancementLatencyMs: null,
      enhancementError: message,
    };
  }
}
