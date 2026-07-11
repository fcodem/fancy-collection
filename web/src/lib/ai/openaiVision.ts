import { setTimeout as delay } from "timers/promises";
import { createHash } from "crypto";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { resolveOpenAiKey, readAiRuntimeSettings } from "./aiRuntimeSettings";

type OpenAiImageSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

export type StructuredVisionMetadata = {
  category?: string;
  subcategory?: string;
  primaryColours?: string[];
  secondaryColours?: string[];
  embroideryType?: string;
  borderStyle?: string;
  texture?: string;
  fabric?: string;
  pattern?: string;
  sleeveStyle?: string;
  neckline?: string;
  silhouette?: string;
  motifs?: string[];
  occasion?: string;
  gender?: string;
  accessoryType?: string;
  jewelleryType?: string;
  visualDescription?: string;
};

type JsonLike = Record<string, unknown>;
const metadataCache = new Map<string, { expiresAt: number; value: StructuredVisionMetadata }>();
const enhancementCache = new Map<string, { expiresAt: number; value: { buffer: Buffer; model: string; latencyMs: number; size: OpenAiImageSize } }>();

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function asDataUrl(buf: Buffer, mime = "image/jpeg"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function parseJsonObject(text: string): JsonLike {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned) as JsonLike;
}

export async function createOpenAiClient(timeoutMs?: number): Promise<OpenAI> {
  return new OpenAI({
    apiKey: await resolveOpenAiKey(),
    timeout: timeoutMs,
    maxRetries: 0,
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < retries) await delay(400 * (i + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI call failed");
}

export async function generateVisionMetadataFromOpenAi(
  imageBuffer: Buffer,
  hint: { category: string; itemType: string },
): Promise<StructuredVisionMetadata> {
  const settings = await readAiRuntimeSettings();
  const model = settings.visionModel || "gpt-4.1-mini";
  const timeoutMs = settings.timeoutMs || 30000;
  const retries = settings.retryCount || 2;

  const cacheKey = `meta:${model}:${hint.category}:${hint.itemType}:${hashBuffer(imageBuffer)}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const systemPrompt =
    "You are a strict fashion-analysis engine for cloth rental inventory. Return valid JSON only.";
  const schemaPrompt = `Analyze this inventory image and return JSON with these keys only:
{
  "category": string,
  "subcategory": string,
  "primaryColours": string[],
  "secondaryColours": string[],
  "embroideryType": string,
  "borderStyle": string,
  "texture": string,
  "fabric": string,
  "pattern": string,
  "sleeveStyle": string,
  "neckline": string,
  "silhouette": string,
  "motifs": string[],
  "occasion": string,
  "gender": string,
  "accessoryType": string,
  "jewelleryType": string,
  "visualDescription": string
}
Context: category="${hint.category}", itemType="${hint.itemType}"`;

  const client = await createOpenAiClient(timeoutMs);
  const response = await withRetry(
    () =>
      client.responses.create({
        model,
        temperature: 0.1,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: schemaPrompt },
              { type: "input_image", image_url: asDataUrl(imageBuffer) },
            ],
          },
        ],
      } as OpenAI.Responses.ResponseCreateParamsNonStreaming),
    retries,
  );

  const text = response.output_text?.trim() || "{}";
  const json = parseJsonObject(text);
  const value = json as StructuredVisionMetadata;
  metadataCache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60_000 });
  return value;
}

export async function generateTextEmbedding(text: string): Promise<number[]> {
  const settings = await readAiRuntimeSettings();
  const model = settings.embeddingModel || "text-embedding-3-large";
  const timeoutMs = settings.timeoutMs || 30000;
  const retries = settings.retryCount || 2;
  const client = await createOpenAiClient(timeoutMs);
  const response = await withRetry(
    () =>
      client.embeddings.create({
        model,
        input: text.slice(0, 7000),
      }),
    retries,
  );
  return response.data?.[0]?.embedding || [];
}

export async function enhanceInventoryImage(
  imageBuffer: Buffer,
  /** Full prompt text from buildEnhancementPrompt() or buildMarketingPrompt() */
  styleOrPrompt: string,
  itemId?: number,
): Promise<{ enhancedBuffer: Buffer; model: string; latencyMs: number; size: OpenAiImageSize }> {
  const started = Date.now();
  const settings = await readAiRuntimeSettings();
  const model = settings.enhancementModel || "gpt-image-1";
  const quality = settings.enhancementQuality || "high";

  // Detect the aspect ratio of the source image so we output at the same orientation.
  // Portrait clothing photos (lehengas, gowns, etc.) should stay portrait.
  let size: OpenAiImageSize = settings.enhancementSize || "1024x1536";
  try {
    const meta = await sharp(imageBuffer).metadata();
    if (meta.width && meta.height) {
      if (meta.width > meta.height * 1.2) {
        size = "1536x1024"; // landscape
      } else if (meta.height > meta.width * 1.05) {
        size = "1024x1536"; // portrait — best for full-length garments
      } else {
        size = "1024x1024"; // square
      }
    }
  } catch {
    // keep default
  }

  const timeoutMs = Math.max(settings.timeoutMs || 90000, 90000);
  const retries = settings.retryCount ?? 2;

  if (!imageBuffer?.length) {
    throw new Error("enhanceInventoryImage: input buffer is empty");
  }

  const preparedBuffer = await prepareImageForOpenAiEdit(imageBuffer);
  if (itemId && preparedBuffer.length !== imageBuffer.length) {
    console.log(
      `[ai-enhancement-pipeline] item=${itemId} resized input ${imageBuffer.length} -> ${preparedBuffer.length} bytes`,
    );
  }

  const cacheKey = `enh:${model}:${quality}:${size}:${hashBuffer(Buffer.from(styleOrPrompt))}:${hashBuffer(preparedBuffer)}`;
  const cached = enhancementCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (itemId) {
      console.log(`[ai-enhancement-pipeline] item=${itemId} openai_response_received — cache hit`);
    }
    return {
      enhancedBuffer: cached.value.buffer,
      model: cached.value.model,
      latencyMs: 0,
      size: cached.value.size,
    };
  }

  let client: OpenAI;
  try {
    client = await createOpenAiClient(timeoutMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OpenAI client init failed";
    if (itemId) console.error(`[ai-enhancement-pipeline] item=${itemId} createOpenAiClient failed:`, msg);
    throw new Error(`OpenAI client init failed: ${msg}`);
  }

  const image = await toFile(preparedBuffer, "inventory.jpg", { type: "image/jpeg" });
  const requestMeta = redactOpenAiPayload({ model, quality, size, inputBytes: preparedBuffer.length });
  if (itemId) {
    console.log(`[ai-enhancement-pipeline] item=${itemId} calling OpenAI images.edit`, requestMeta);
  }

  let payload: Awaited<ReturnType<OpenAI["images"]["edit"]>>;
  try {
    payload = await withRetry(
      () =>
        client.images.edit({
          model,
          image,
          prompt: styleOrPrompt,
          size,
          quality,
        } as OpenAI.Images.ImageEditParams),
      retries,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OpenAI images.edit failed";
    if (itemId) {
      console.error(`[ai-enhancement-pipeline] item=${itemId} OpenAI images.edit failed`, requestMeta, err);
    }
    throw new Error(`OpenAI images.edit failed: ${msg}`);
  }

  const imagePayload = payload as { data?: Array<{ b64_json?: string }> };
  const b64 = imagePayload.data?.[0]?.b64_json;
  if (!b64) {
    if (itemId) {
      console.error(
        `[ai-enhancement-pipeline] item=${itemId} empty OpenAI response`,
        JSON.stringify(redactOpenAiPayload({ dataLength: imagePayload.data?.length ?? 0 })),
      );
    }
    throw new Error("OpenAI image edit returned empty image (no b64_json in response)");
  }

  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) {
    throw new Error("OpenAI image edit returned zero-length buffer after base64 decode");
  }

  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.format || !["jpeg", "jpg", "png", "webp"].includes(meta.format)) {
      throw new Error(`OpenAI returned invalid image format: ${meta.format ?? "unknown"}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid image from OpenAI";
    throw new Error(`OpenAI output validation failed: ${msg}`);
  }

  const latencyMs = Date.now() - started;
  enhancementCache.set(cacheKey, {
    value: { buffer, model, latencyMs, size },
    expiresAt: Date.now() + 15 * 60_000,
  });
  return { enhancedBuffer: buffer, model, latencyMs, size };
}

function redactOpenAiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...payload };
  for (const key of Object.keys(clone)) {
    if (/key|token|secret|authorization/i.test(key)) clone[key] = "[REDACTED]";
  }
  return clone;
}

/**
 * Prepare an image for OpenAI images.edit.
 *
 * Rules:
 *  - gpt-image-1 accepts up to 20MB per image, max 2048px edge
 *  - We target max 1536px edge, JPEG q=95 for high-fidelity background replacement
 *  - Higher quality input → better detail preservation in the output
 *  - Must be a single-frame JPEG or PNG (convert if needed)
 */
async function prepareImageForOpenAiEdit(buffer: Buffer): Promise<Buffer> {
  const maxEdge = 1536;
  const maxBytes = 16_000_000; // 16 MB safe limit

  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const needsResize = w > maxEdge || h > maxEdge;
  const needsReencode = buffer.length > maxBytes || meta.format === "gif" || meta.format === "tiff";

  if (!needsResize && !needsReencode) {
    // Still re-encode to strip EXIF and fix orientation
    return sharp(buffer)
      .rotate() // auto-orient from EXIF
      .jpeg({ quality: 95, mozjpeg: false })
      .toBuffer();
  }

  return sharp(buffer)
    .rotate()
    .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 95, mozjpeg: false })
    .toBuffer();
}
