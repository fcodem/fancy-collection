import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import prisma from "@/lib/prisma";

export type AiRuntimeSettings = {
  openaiApiKey?: string | null;
  visionModel?: string;
  embeddingModel?: string;
  enhancementModel?: string;
  enhancementQuality?: "low" | "medium" | "high";
  enhancementSize?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  concurrency?: number;
  retryCount?: number;
  timeoutMs?: number;
  fallbackBehavior?: "original" | "error";
};

const PREFIX = "enc:v1:";
const DEFAULTS: Required<Omit<AiRuntimeSettings, "openaiApiKey">> = {
  visionModel: "gpt-4.1-mini",
  embeddingModel: "text-embedding-3-large",
  enhancementModel: "gpt-image-1",
  enhancementQuality: "high",
  enhancementSize: "1536x1024",
  concurrency: 2,
  retryCount: 2,
  timeoutMs: 30000,
  fallbackBehavior: "original",
};

function keyMaterial(): Buffer {
  const secret =
    process.env.AI_SETTINGS_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "";
  if (!secret) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      throw new Error("AI_SETTINGS_SECRET or SESSION_SECRET must be set in production.");
    }
    return createHash("sha256").update("dev-only-ai-settings").digest();
  }
  return createHash("sha256").update(secret).digest();
}

function encrypt(raw: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const ciphertext = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

function decrypt(input: string): string {
  if (!input.startsWith(PREFIX)) return input;
  const payload = input.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return "";
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

function parseSettingValue(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function readAiRuntimeSettings(): Promise<AiRuntimeSettings> {
  const row = await prisma.aiRuntimeSetting.findUnique({ where: { key: "openai" } });
  const payload = parseSettingValue(row?.value);
  const encryptedApiKey = typeof payload.openaiApiKey === "string" ? payload.openaiApiKey : null;
  const openaiApiKey = encryptedApiKey ? decrypt(encryptedApiKey) : null;
  return {
    openaiApiKey,
    visionModel: String(payload.visionModel || DEFAULTS.visionModel),
    embeddingModel: String(payload.embeddingModel || DEFAULTS.embeddingModel),
    enhancementModel: String(payload.enhancementModel || DEFAULTS.enhancementModel),
    enhancementQuality:
      (payload.enhancementQuality as AiRuntimeSettings["enhancementQuality"]) ||
      DEFAULTS.enhancementQuality,
    enhancementSize:
      (payload.enhancementSize as AiRuntimeSettings["enhancementSize"]) || DEFAULTS.enhancementSize,
    concurrency: Math.max(1, Number(payload.concurrency || DEFAULTS.concurrency)),
    retryCount: Math.max(0, Number(payload.retryCount || DEFAULTS.retryCount)),
    timeoutMs: Math.max(5000, Number(payload.timeoutMs || DEFAULTS.timeoutMs)),
    fallbackBehavior:
      (payload.fallbackBehavior as AiRuntimeSettings["fallbackBehavior"]) ||
      DEFAULTS.fallbackBehavior,
  };
}

export async function writeAiRuntimeSettings(
  data: AiRuntimeSettings,
  updatedBy: string,
): Promise<AiRuntimeSettings> {
  const existing = await readAiRuntimeSettings();
  const merged: AiRuntimeSettings = {
    ...existing,
    ...data,
    openaiApiKey:
      data.openaiApiKey === undefined ? existing.openaiApiKey : data.openaiApiKey || null,
  };
  const payload = {
    visionModel: merged.visionModel || DEFAULTS.visionModel,
    embeddingModel: merged.embeddingModel || DEFAULTS.embeddingModel,
    enhancementModel: merged.enhancementModel || DEFAULTS.enhancementModel,
    enhancementQuality: merged.enhancementQuality || DEFAULTS.enhancementQuality,
    enhancementSize: merged.enhancementSize || DEFAULTS.enhancementSize,
    concurrency: Math.max(1, Number(merged.concurrency || DEFAULTS.concurrency)),
    retryCount: Math.max(0, Number(merged.retryCount || DEFAULTS.retryCount)),
    timeoutMs: Math.max(5000, Number(merged.timeoutMs || DEFAULTS.timeoutMs)),
    fallbackBehavior: merged.fallbackBehavior || DEFAULTS.fallbackBehavior,
    openaiApiKey: merged.openaiApiKey ? encrypt(merged.openaiApiKey) : null,
  };
  await prisma.aiRuntimeSetting.upsert({
    where: { key: "openai" },
    create: {
      key: "openai",
      encrypted: true,
      value: JSON.stringify(payload),
      updatedBy,
    },
    update: {
      encrypted: true,
      value: JSON.stringify(payload),
      updatedBy,
    },
  });
  return readAiRuntimeSettings();
}

export async function resolveOpenAiKey(): Promise<string> {
  const fromEnv = (process.env.OPENAI_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  const settings = await readAiRuntimeSettings();
  const fromSettings = settings.openaiApiKey?.trim();
  if (fromSettings) return fromSettings;
  throw new Error("OpenAI API key is not configured");
}

export function maskApiKey(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length < 10) return "********";
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}
