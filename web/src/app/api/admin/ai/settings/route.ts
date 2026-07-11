import { NextRequest } from "next/server";
import { isResponse, jsonError, jsonOk, requireOwner } from "@/lib/api";
import {
  maskApiKey,
  readAiRuntimeSettings,
  resolveOpenAiKey,
  writeAiRuntimeSettings,
} from "@/lib/ai/aiRuntimeSettings";
import { verifyOpenAiApiKey } from "@/lib/ai/verifyOpenAiKey";
import prisma from "@/lib/prisma";
import { scheduleInventoryAiProfile } from "@/lib/inventoryAiProfile/queue";

async function queueFailedEnhancements(): Promise<number> {
  const failed = await prisma.clothingItem.findMany({
    where: { enhancementStatus: "failed", photo: { not: null } },
    select: { id: true },
    take: 100,
  });
  for (const item of failed) {
    scheduleInventoryAiProfile(item.id, "full", "key_configured_retry");
  }
  return failed.length;
}
export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const settings = await readAiRuntimeSettings();
  const hasKey = !!(settings.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim());
  return jsonOk({
    ok: true,
    hasApiKey: hasKey,
    settings: {
      ...settings,
      openaiApiKey: undefined,
      openaiApiKeyMasked: maskApiKey(settings.openaiApiKey),
    },
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const newKey = typeof body.openaiApiKey === "string" ? body.openaiApiKey.trim() : "";

    if (newKey) {
      const verified = await verifyOpenAiApiKey(newKey);
      if (!verified.ok) {
        return jsonError(`OpenAI key verification failed: ${verified.error}`, 400);
      }
    } else {
      const existing = await readAiRuntimeSettings();
      const hasExisting = !!(existing.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim());
      if (!hasExisting) {
        return jsonError(
          "OpenAI API key is required. Paste your sk-... key in the API Key field, then click Save.",
          400,
        );
      }
    }

    const saved = await writeAiRuntimeSettings(
      {
        openaiApiKey: newKey || undefined,
        visionModel: typeof body.visionModel === "string" ? body.visionModel : undefined,
        embeddingModel: typeof body.embeddingModel === "string" ? body.embeddingModel : undefined,
        enhancementModel:
          typeof body.enhancementModel === "string" ? body.enhancementModel : undefined,
        enhancementQuality:
          body.enhancementQuality === "low" ||
          body.enhancementQuality === "medium" ||
          body.enhancementQuality === "high"
            ? body.enhancementQuality
            : undefined,
        enhancementSize:
          body.enhancementSize === "1024x1024" ||
          body.enhancementSize === "1024x1536" ||
          body.enhancementSize === "1536x1024" ||
          body.enhancementSize === "auto"
            ? body.enhancementSize
            : undefined,
        concurrency:
          typeof body.concurrency === "number"
            ? Math.max(1, Math.min(8, Math.floor(body.concurrency)))
            : undefined,
        retryCount:
          typeof body.retryCount === "number"
            ? Math.max(0, Math.min(5, Math.floor(body.retryCount)))
            : undefined,
        timeoutMs:
          typeof body.timeoutMs === "number"
            ? Math.max(5000, Math.min(120000, Math.floor(body.timeoutMs)))
            : undefined,
        fallbackBehavior:
          body.fallbackBehavior === "error" || body.fallbackBehavior === "original"
            ? body.fallbackBehavior
            : undefined,
      },
      user.username,
    );

    let queuedRetries = 0;
    if (newKey) {
      try {
        await resolveOpenAiKey();
        queuedRetries = await queueFailedEnhancements();
      } catch {
        // key saved but resolve failed — unlikely after verify
      }
    }

    return jsonOk({
      ok: true,
      hasApiKey: true,
      queuedRetries,
      settings: {
        ...saved,
        openaiApiKey: undefined,
        openaiApiKeyMasked: maskApiKey(saved.openaiApiKey),
      },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed to save AI settings", 400);
  }
}
