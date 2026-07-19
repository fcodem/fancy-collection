import prisma from "../prisma";
import { dressDisplayName } from "../dress";
import { mapConfidence } from "../siglipMath";

export type InventoryPhotoSearchFilters = {
  category?: string;
  subCategory?: string;
  mode?: "AUTO" | "MANUAL" | "ALL";
  size?: string;
  color?: string;
  gender?: string;
  status?: string;
  designer?: string;
  minPrice?: number;
  maxPrice?: number;
};

export type PhotoSearchResult = {
  ok: true;
  category: string;
  category_results: Array<Record<string, unknown>>;
  other_results: Array<Record<string, unknown>>;
  used_fallback: boolean;
  fallback_reason?: string | null;
  fallback_code?: string | null;
  search_degraded?: boolean;
  degradation?: import("../dressChecker/searchHealth").SearchDegradation | null;
  results: Array<Record<string, unknown>>;
  search_engine: string;
  best_similarity: number;
  reliable_identification: boolean;
  identification_meta?: Record<string, unknown>;
  image_warnings?: string[];
  detectedStyle?: string;
  detectedColor?: string;
  detectedPattern?: string;
  detectedEmbroidery?: string;
  screenshot_warning?: boolean;
  similar_available?: Array<Record<string, unknown>>;
  ai_diagnostics?: Record<string, unknown>;
};

/**
 * Heavy AI/photo search entry point. Kept out of inventoryOps so ordinary
 * inventory create/update/delete routes never trace model execution packages.
 */
export async function photoSearchInventory(
  photoBuffer: Buffer,
  filters: InventoryPhotoSearchFilters = {},
  options: { debug?: boolean; mime?: string } = {},
): Promise<PhotoSearchResult> {
  const { validateDressCheckerImage } = await import("../dressCheckerValidation");
  const validation = await validateDressCheckerImage(photoBuffer, options.mime);
  if (!validation.ok) throw new Error(validation.message);

  const { normalizeImageBuffer, isLikelyScreenshot } = await import("../photoHash");
  let safeBuffer: Buffer;
  let screenshotWarning = false;
  try {
    safeBuffer = await normalizeImageBuffer(photoBuffer);
    screenshotWarning = await isLikelyScreenshot(safeBuffer);
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message.includes("dimensions")
        ? "Could not read this image. Please upload a JPG or PNG photo."
        : "Could not process this image. Try a different photo or format (JPG/PNG/WEBP).",
    );
  }

  console.log("[DressSearch] VECTOR SEARCH path=pgvector");
  try {
    const { searchInventoryByDressCheckerEnterprise } = await import(
      "../dressChecker/enterpriseSearch"
    );
    const enterprise = await searchInventoryByDressCheckerEnterprise(
      safeBuffer,
      {
        category: filters.category || "",
        subCategory: filters.subCategory || "",
        mode: filters.mode || "MANUAL",
      },
      { debug: options.debug },
    );
    console.log(
      `[DressSearch] VECTOR SEARCH OK engine=pgvector results=${enterprise.results.length} ms=${enterprise.processing_time_ms}`,
    );
    return {
      ...(enterprise as unknown as PhotoSearchResult),
      similar_available: enterprise.similar_available,
      ai_diagnostics: enterprise.ai_diagnostics,
      screenshot_warning: screenshotWarning,
      image_warnings: validation.warnings,
      used_fallback: false,
      fallback_reason: null,
      fallback_code: null,
      search_degraded: false,
      degradation: null,
    };
  } catch (enterpriseErr) {
    const { VectorSearchFailure } = await import("../dressChecker/enterpriseSearch");
    const { buildSearchDegradation, logSearchDegradation } = await import(
      "../dressChecker/searchHealth"
    );
    const exactReason =
      enterpriseErr instanceof VectorSearchFailure
        ? enterpriseErr.reason
        : enterpriseErr instanceof Error
          ? `Unexpected search error: ${enterpriseErr.message}`
          : "Unexpected search error";
    const failureCode =
      enterpriseErr instanceof VectorSearchFailure
        ? enterpriseErr.code
        : "UNEXPECTED_SEARCH_ERROR";
    const infraCodes = new Set([
      "PGVECTOR_MISSING",
      "EMBEDDINGS_MISSING",
      "EMBEDDINGS_MISSING_ALL",
      "VECTOR_COLUMN_MISSING",
      "DATABASE_UNAVAILABLE",
    ]);
    if (!infraCodes.has(String(failureCode))) {
      console.error(
        `[DressSearch] Refusing hash fallback for application/search error code=${failureCode}`,
      );
      throw enterpriseErr;
    }
    const vectorDiagnostics =
      enterpriseErr instanceof VectorSearchFailure ? enterpriseErr.diagnostics : {};
    const degradation = buildSearchDegradation(
      exactReason,
      { ...vectorDiagnostics, failure_code: failureCode },
      filters.category || undefined,
    );
    degradation.code = failureCode;
    logSearchDegradation(degradation);
    const hashResult = await photoSearchInventoryHash(
      safeBuffer,
      filters.category || "",
      degradation,
    );
    return {
      ...hashResult,
      screenshot_warning: screenshotWarning,
      image_warnings: validation.warnings,
    };
  }
}

async function photoSearchInventoryHash(
  photoBuffer: Buffer,
  category = "",
  degradation?: import("../dressChecker/searchHealth").SearchDegradation,
) {
  console.log("[DressSearch] HASH FALLBACK ACTIVE — degraded search, not primary engine");
  if (degradation) {
    console.log(`[DressSearch] HASH FALLBACK cause code=${degradation.code}`);
    console.log(`[DressSearch] HASH FALLBACK cause reason=${degradation.reason}`);
  }
  const { computeImageFingerprint, combinedImageSimilarity, PHOTO_MATCH_MIN_SCORE } =
    await import("../photoHash");
  const { loadPhotoBuffer } = await import("./siglipSearch");
  const queryFp = await computeImageFingerprint(photoBuffer);
  const allItems = await prisma.clothingItem.findMany({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      status: true,
      size: true,
      color: true,
      photo: true,
      dailyRate: true,
      subCategory: true,
    },
  });
  const scored: Array<{ similarity: number; item: (typeof allItems)[0] }> = [];
  for (const item of allItems) {
    if (!item.photo) continue;
    const storedBuffer = await loadPhotoBuffer(item.photo);
    if (!storedBuffer) continue;
    try {
      const storedFp = await computeImageFingerprint(storedBuffer);
      const similarity = combinedImageSimilarity(queryFp, storedFp);
      if (similarity >= PHOTO_MATCH_MIN_SCORE) scored.push({ similarity, item });
    } catch {
      continue;
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);

  const toDict = (similarity: number, item: (typeof allItems)[0]) => ({
    id: item.id,
    name: item.name,
    display_name: dressDisplayName(item.name, item.category, item.size),
    sku: item.sku,
    category: item.category,
    status: item.status,
    size: item.size || "",
    color: item.color || "",
    photo: item.photo || "",
    daily_rate: item.dailyRate,
    sub_category: item.subCategory || "",
    inventory_location: "",
    similarity,
    confidence: mapConfidence(similarity),
  });

  let category_results: ReturnType<typeof toDict>[] = [];
  let other_results: ReturnType<typeof toDict>[] = [];
  if (category) {
    const categoryScored = scored.filter((entry) => entry.item.category === category).slice(0, 10);
    if (categoryScored.length) {
      category_results = categoryScored.map((entry) => toDict(entry.similarity, entry.item));
    } else {
      other_results = scored
        .filter((entry) => entry.item.category !== category)
        .slice(0, 10)
        .map((entry) => toDict(entry.similarity, entry.item));
    }
  } else {
    category_results = scored
      .slice(0, 10)
      .map((entry) => toDict(entry.similarity, entry.item));
  }

  const results = [...category_results, ...other_results];
  const fallbackReason = degradation
    ? `Hash fallback after pgvector failed [${degradation.code}]: ${degradation.reason}`
    : "Hash fallback — pgvector search was not attempted";
  return {
    ok: true as const,
    category,
    category_results,
    other_results,
    used_fallback: true,
    search_degraded: true,
    degradation: degradation ?? null,
    fallback_reason: fallbackReason,
    fallback_code: degradation?.code ?? "SEARCH_DEGRADED_HASH",
    results,
    search_engine: "hash" as const,
    best_similarity: results[0]?.similarity ?? 0,
    reliable_identification: false,
    ai_diagnostics: degradation
      ? {
          search_degradation: degradation,
          warning:
            "Hash results are approximate — fix pgvector/infrastructure. Do not auto-identify.",
        }
      : undefined,
  };
}
