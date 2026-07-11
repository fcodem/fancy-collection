import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { prepareSiglipEmbeddingInput } from "@/lib/siglipPreprocess";
import type { EmbeddingModelTier } from "./constants";

export function l2Normalize(vector: number[]): number[] {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

export function tensorDataToVector(data: Float32Array | number[]): number[] {
  return Array.from(data instanceof Float32Array ? data : data);
}

type TransformersEnv = {
  cacheDir: string;
  allowLocalModels: boolean;
};

async function configureTransformersEnv(): Promise<void> {
  const { env } = await import("@xenova/transformers");
  const tenv = env as TransformersEnv;
  tenv.cacheDir = process.env.TRANSFORMERS_CACHE || join(tmpdir(), "transformers-cache");
  tenv.allowLocalModels = false;
}

export async function prepareModelImageBuffer(buffer: Buffer): Promise<Buffer> {
  return prepareSiglipEmbeddingInput(buffer);
}

export async function withTempImage(
  buffer: Buffer,
  tier: EmbeddingModelTier,
  fn: (tmpPath: string) => Promise<number[]>,
): Promise<number[]> {
  const prepared = await prepareModelImageBuffer(buffer);
  const tmpPath = join(tmpdir(), `embed-${tier}-${process.pid}-${Date.now()}.jpg`);
  await writeFile(tmpPath, prepared);
  try {
    return await fn(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

type ClipVisionBundle = {
  processor: (image: unknown) => Promise<Record<string, unknown>>;
  visionModel: (inputs: Record<string, unknown>) => Promise<{
    image_embeds?: { data: Float32Array | number[] };
    pooler_output?: { data: Float32Array | number[] };
  }>;
};

const clipModelPromises = new Map<string, Promise<ClipVisionBundle>>();

async function getClipVisionBundle(modelId: string): Promise<ClipVisionBundle> {
  let promise = clipModelPromises.get(modelId);
  if (!promise) {
    promise = (async () => {
      await configureTransformersEnv();
      const { AutoProcessor, CLIPVisionModelWithProjection } = await import("@xenova/transformers");
      const [processor, visionModel] = await Promise.all([
        AutoProcessor.from_pretrained(modelId),
        CLIPVisionModelWithProjection.from_pretrained(modelId),
      ]);
      return {
        processor: processor as ClipVisionBundle["processor"],
        visionModel: visionModel as ClipVisionBundle["visionModel"],
      };
    })();
    clipModelPromises.set(modelId, promise);
  }
  return promise;
}

type SiglipVisionBundle = {
  processor: (image: unknown) => Promise<Record<string, unknown>>;
  visionModel: (inputs: Record<string, unknown>) => Promise<{
    pooler_output: { data: Float32Array | number[] };
  }>;
};

const siglipModelPromises = new Map<string, Promise<SiglipVisionBundle>>();

async function getSiglipVisionBundle(modelId: string): Promise<SiglipVisionBundle> {
  let promise = siglipModelPromises.get(modelId);
  if (!promise) {
    promise = (async () => {
      await configureTransformersEnv();
      const { AutoProcessor, SiglipVisionModel } = await import("@xenova/transformers");
      const [processor, visionModel] = await Promise.all([
        AutoProcessor.from_pretrained(modelId),
        SiglipVisionModel.from_pretrained(modelId),
      ]);
      return {
        processor: processor as SiglipVisionBundle["processor"],
        visionModel: visionModel as SiglipVisionBundle["visionModel"],
      };
    })();
    siglipModelPromises.set(modelId, promise);
  }
  return promise;
}

export async function embedWithClipVisionModel(
  buffer: Buffer,
  modelId: string,
  tier: EmbeddingModelTier,
): Promise<number[]> {
  return withTempImage(buffer, tier, async (tmpPath) => {
    const { RawImage } = await import("@xenova/transformers");
    const { processor, visionModel } = await getClipVisionBundle(modelId);
    const image = await RawImage.read(tmpPath);
    const inputs = await processor(image);
    const output = await visionModel(inputs);
    const tensor = output.image_embeds ?? output.pooler_output;
    if (!tensor?.data) throw new Error(`${modelId} returned no image embeddings`);
    return l2Normalize(tensorDataToVector(tensor.data));
  });
}

export async function embedWithSiglipVisionModel(
  buffer: Buffer,
  modelId: string,
): Promise<number[]> {
  return withTempImage(buffer, "siglip", async (tmpPath) => {
    const { RawImage } = await import("@xenova/transformers");
    const { processor, visionModel } = await getSiglipVisionBundle(modelId);
    const image = await RawImage.read(tmpPath);
    const inputs = await processor(image);
    const { pooler_output } = await visionModel(inputs);
    if (!pooler_output?.data) throw new Error(`${modelId} returned no pooler_output`);
    return l2Normalize(tensorDataToVector(pooler_output.data));
  });
}
