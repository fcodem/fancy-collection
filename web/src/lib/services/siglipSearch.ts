import {
  identificationPhotoSearch,
  type IdentificationSearchFilters,
  type IdentificationResultItem,
} from "./dressIdentificationPipeline";
import type { ComponentScores, MatchDebugInfo } from "../dressIdentificationTypes";
import type { DressCheckerSearchMeta } from "../dressCheckerTypes";
import type { DressCheckerDebugPayload } from "../dressCheckerDebug";

export const PHOTO_SEARCH_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_SEARCH_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type SiglipSearchFilters = IdentificationSearchFilters;

export type SiglipSearchResultItem = IdentificationResultItem & {
  component_scores?: ComponentScores;
  rank_reason?: string;
  best_reference?: { refId: string; label: string; querySource: string };
  identification_debug?: MatchDebugInfo[];
};

export type SiglipSearchResponse = {
  ok: true;
  category: string;
  detected_category?: string;
  category_results: SiglipSearchResultItem[];
  other_results: SiglipSearchResultItem[];
  used_fallback: boolean;
  results: SiglipSearchResultItem[];
  search_engine: "identification" | "hash";
  best_similarity: number;
  reliable_identification: boolean;
  pipeline_stages?: {
    stage_a_category: string;
    stage_b_candidates: number;
    stage_c_scored: number;
  };
  category_detection?: {
    category: string;
    confidence: number;
    scores: Record<string, number>;
  };
  identification_meta?: DressCheckerSearchMeta;
  dress_checker_debug?: DressCheckerDebugPayload;
  image_warnings?: string[];
};

export async function loadPhotoBuffer(photo: string): Promise<Buffer | null> {
  try {
    if (photo.startsWith("http://") || photo.startsWith("https://")) {
      const res = await fetch(photo);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    return await readFile(join(process.cwd(), "public", "uploads", photo.replace(/^uploads\//, "")));
  } catch {
    return null;
  }
}

export async function siglipPhotoSearch(
  photoBuffer: Buffer,
  filters: SiglipSearchFilters = {},
  options: { debug?: boolean } = {},
): Promise<SiglipSearchResponse> {
  const result = await identificationPhotoSearch(photoBuffer, filters, options);
  return result;
}

export function validatePhotoUpload(file: File, buffer: Buffer): string | null {
  if (buffer.length < 100) return "Image file is too small or empty";
  if (buffer.length > PHOTO_SEARCH_MAX_BYTES) {
    return `Image must be under ${PHOTO_SEARCH_MAX_BYTES / (1024 * 1024)}MB`;
  }
  const mime = (file.type || "").toLowerCase();
  if (mime && !PHOTO_SEARCH_ALLOWED_MIME.has(mime)) {
    return "Only JPG, JPEG, PNG, and WEBP images are allowed";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext && !["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return "Only JPG, JPEG, PNG, and WEBP images are allowed";
  }
  return null;
}
