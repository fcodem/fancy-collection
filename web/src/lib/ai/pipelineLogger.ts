import prisma from "@/lib/prisma";

export type PipelineStage =
  | "pipeline_started"
  | "image_loaded"
  | "calling_openai"
  | "openai_response_received"
  | "saving_enhanced_image"
  | "enhanced_image_saved"
  | "updating_database"
  | "pipeline_completed"
  | "pipeline_failed";

const LOG_PREFIX = "[ai-enhancement-pipeline]";

export function pipelineLog(
  itemId: number,
  stage: PipelineStage,
  detail?: string,
  extra?: Record<string, unknown>,
): void {
  const suffix = detail ? ` — ${detail}` : "";
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${LOG_PREFIX} item=${itemId} ${stage}${suffix}${payload}`);
}

export async function pipelineLogToDb(
  itemId: number,
  event: string,
  message?: string,
  options: { durationMs?: number; retryCount?: number } = {},
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO inventory_ai_profiles (item_id, status, updated_at)
       VALUES ($1, 'processing', NOW())
       ON CONFLICT (item_id) DO NOTHING`,
      itemId,
    );
    await prisma.inventoryAiProfileLog.create({
      data: {
        itemId,
        event,
        message: message ?? null,
        durationMs: options.durationMs ?? null,
        retryCount: options.retryCount ?? null,
      },
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} item=${itemId} failed to persist log:`, err);
  }
}

export function formatPipelineError(err: unknown): string {
  if (err instanceof Error) {
    const stack = err.stack ? `\n${err.stack}` : "";
    return `${err.message}${stack}`;
  }
  return String(err);
}

export function redactOpenAiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...payload };
  for (const key of Object.keys(clone)) {
    if (/key|token|secret|authorization/i.test(key)) {
      clone[key] = "[REDACTED]";
    }
  }
  return clone;
}
