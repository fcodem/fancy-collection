import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { SIGLIP_EMBEDDING_DIM, cosineSimilarity } from "./siglipMath";
import { prepareSiglipEmbeddingInput, SIGLIP_MODEL_ID } from "./siglipPreprocess";

const MODEL_ID = SIGLIP_MODEL_ID;

type Processor = { (image: unknown): Promise<Record<string, unknown>> };
type VisionModel = {
  (inputs: Record<string, unknown>): Promise<{ pooler_output: { data: Float32Array | number[] } }>;
};

let modelPromise: Promise<{ processor: Processor; visionModel: VisionModel }> | null = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { AutoProcessor, SiglipVisionModel, env } = await import("@xenova/transformers");
      env.cacheDir = process.env.TRANSFORMERS_CACHE || join(tmpdir(), "transformers-cache");
      env.allowLocalModels = false;
      const [processor, visionModel] = await Promise.all([
        AutoProcessor.from_pretrained(MODEL_ID),
        SiglipVisionModel.from_pretrained(MODEL_ID),
      ]);
      return {
        processor: processor as Processor,
        visionModel: visionModel as VisionModel,
      };
    })();
  }
  return modelPromise;
}

function tensorToVector(output: { data: Float32Array | number[] }): number[] {
  const raw = output.data;
  const vector = Array.from(raw instanceof Float32Array ? raw : raw);
  if (vector.length !== SIGLIP_EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding size: ${vector.length}`);
  }
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

/** Generate a L2-normalized SigLIP embedding from a prepared image buffer. */
export async function generateImageEmbedding(buffer: Buffer): Promise<number[]> {
  const prepared = await prepareSiglipEmbeddingInput(buffer);
  const { RawImage } = await import("@xenova/transformers");
  const tmpPath = join(tmpdir(), `siglip-${process.pid}-${Date.now()}.jpg`);
  await writeFile(tmpPath, prepared);
  try {
    const { processor, visionModel } = await getModel();
    const image = await RawImage.read(tmpPath);
    const inputs = await processor(image);
    const { pooler_output } = await visionModel(inputs);
    return tensorToVector(pooler_output);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

/** Multi-crop embeddings for search queries (handles screenshots and small thumbnails). */
export async function generateQueryEmbeddings(buffer: Buffer): Promise<number[][]> {
  const variants = await buildEmbeddingVariants(buffer, "query");
  return Promise.all(variants.map((v) => generateImageEmbedding(v)));
}

/** Multi-reference embeddings for catalog items (front/back/mannequin/folded viewpoints). */
export async function generateReferenceEmbeddings(buffer: Buffer): Promise<number[][]> {
  const variants = await buildEmbeddingVariants(buffer, "reference");
  return Promise.all(variants.map((v) => generateImageEmbedding(v)));
}

export function maxCosineSimilarity(queries: number[][], stored: number[]): number {
  let best = 0;
  for (const q of queries) {
    best = Math.max(best, cosineSimilarity(q, stored));
  }
  return best;
}

export type StoredSiglipEmbedding = {
  model: string;
  dimension: number;
  primary: number[];
  references: number[][];
  normalized: true;
  indexedAt: string;
};

export function normalizeStoredEmbeddings(raw: unknown): number[][] {
  if (!raw) return [];
  if (Array.isArray(raw) && raw.every((v) => typeof v === "number")) {
    return [raw as number[]];
  }
  if (typeof raw === "string") {
    try {
      return normalizeStoredEmbeddings(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (typeof raw !== "object") return [];
  const maybe = raw as Partial<StoredSiglipEmbedding>;
  const refs = Array.isArray(maybe.references) ? maybe.references : [];
  const primary = Array.isArray(maybe.primary) ? [maybe.primary] : [];
  return [...primary, ...refs].filter(
    (vec): vec is number[] =>
      Array.isArray(vec) &&
      vec.length === SIGLIP_EMBEDDING_DIM &&
      vec.every((n) => typeof n === "number" && Number.isFinite(n)),
  );
}

export function serializeStoredEmbeddings(references: number[][]): StoredSiglipEmbedding {
  const deduped: number[][] = [];
  const seen = new Set<string>();
  for (const vec of references) {
    if (!Array.isArray(vec) || vec.length !== SIGLIP_EMBEDDING_DIM) continue;
    const key = vec.map((n) => n.toFixed(6)).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(vec);
  }
  const primary = deduped[0] || new Array<number>(SIGLIP_EMBEDDING_DIM).fill(0);
  return {
    model: MODEL_ID,
    dimension: SIGLIP_EMBEDDING_DIM,
    primary,
    references: deduped,
    normalized: true,
    indexedAt: new Date().toISOString(),
  };
}

function uniqueVariantKey(buffer: Buffer): string {
  return buffer.subarray(0, Math.min(buffer.length, 128)).toString("base64");
}

async function buildEmbeddingVariants(
  buffer: Buffer,
  mode: "query" | "reference",
): Promise<Buffer[]> {
  const { normalizeImageBuffer, querySearchVariants } = await import("./photoHash");
  const sharp = (await import("sharp")).default;
  const normalized = await normalizeImageBuffer(buffer);
  const meta = await sharp(normalized).metadata();
  const width = Math.max(meta.width ?? 1024, 1);
  const height = Math.max(meta.height ?? 1024, 1);
  const variants: Buffer[] = [];

  const add = async (
    wRatio: number,
    hRatio: number,
    leftRatio: number,
    topRatio: number,
  ) => {
    const w = Math.max(48, Math.round(width * wRatio));
    const h = Math.max(48, Math.round(height * hRatio));
    const left = Math.max(0, Math.min(width - w, Math.round(width * leftRatio)));
    const top = Math.max(0, Math.min(height - h, Math.round(height * topRatio)));
    variants.push(
      await sharp(normalized)
        .extract({ left, top, width: w, height: h })
        .resize(384, 384, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer(),
    );
  };

  variants.push(normalized);
  await add(0.74, 0.86, 0.13, 0.08); // central garment body
  await add(0.74, 0.60, 0.13, 0.30); // lower lehenga panel / border
  await add(0.58, 0.46, 0.21, 0.14); // blouse/waist structure

  if (mode === "query") {
    const queryVariants = await querySearchVariants(normalized);
    variants.push(...queryVariants);
  }

  const deduped: Buffer[] = [];
  const seen = new Set<string>();
  for (const variant of variants) {
    const key = uniqueVariantKey(variant);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(variant);
  }
  return deduped;
}
