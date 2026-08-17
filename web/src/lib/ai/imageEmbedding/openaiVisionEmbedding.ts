import { createHash } from "crypto";
import {
  generateTextEmbedding,
  generateVisionMetadataFromOpenAi,
} from "@/lib/ai/openaiVision";
import { INVENTORY_EMBEDDING_DIM } from "./constants";
import { l2Normalize } from "./backends";

export const OPENAI_VISION_EMBEDDING_MODEL = "openai-vision-text-embedding-3-large-768";

const cache = new Map<string, number[]>();

function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function visionMetadataToSearchText(meta: {
  visualDescription?: string;
  category?: string;
  subcategory?: string;
  primaryColours?: string[];
  secondaryColours?: string[];
  embroideryType?: string;
  borderStyle?: string;
  texture?: string;
  fabric?: string;
  pattern?: string;
  motifs?: string[];
  silhouette?: string;
  sleeveStyle?: string;
  neckline?: string;
}): string {
  return [
    meta.visualDescription,
    meta.category,
    meta.subcategory,
    ...(meta.primaryColours || []),
    ...(meta.secondaryColours || []),
    meta.embroideryType,
    meta.borderStyle,
    meta.texture,
    meta.fabric,
    meta.pattern,
    ...(meta.motifs || []),
    meta.silhouette,
    meta.sleeveStyle,
    meta.neckline,
  ]
    .flat()
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(". ");
}

/** True when this process should skip local ONNX/SigLIP and index with OpenAI. */
export function preferOpenAiImageEmbeddings(): boolean {
  const raw = (process.env.IMAGE_EMBEDDING_MODELS || "").trim().toLowerCase();
  if (raw.split(",").map((s) => s.trim())[0] === "openai") return true;
  if ((process.env.AI_INDEX_BACKEND || "").trim().toLowerCase() === "openai") return true;
  return process.env.VERCEL === "1";
}

/**
 * 768-d embedding compatible with inventory_ai_profiles.embedding_vector.
 * Uses GPT vision description + text-embedding-3-large(dimensions=768).
 */
export async function embedImageWithOpenAi768(buffer: Buffer): Promise<number[]> {
  const key = hashBuffer(buffer);
  const hit = cache.get(key);
  if (hit) return hit;

  const meta = await generateVisionMetadataFromOpenAi(buffer, {
    category: "clothing",
    itemType: "clothing",
  });
  const text = visionMetadataToSearchText(meta);
  if (!text.trim()) {
    throw new Error("OpenAI vision returned empty description");
  }
  const vector = await generateTextEmbedding(text, INVENTORY_EMBEDDING_DIM);
  if (vector.length !== INVENTORY_EMBEDDING_DIM) {
    throw new Error(
      `OpenAI embedding produced ${vector.length}-d; need ${INVENTORY_EMBEDDING_DIM}-d`,
    );
  }
  const normalized = l2Normalize(vector);
  cache.set(key, normalized);
  return normalized;
}
