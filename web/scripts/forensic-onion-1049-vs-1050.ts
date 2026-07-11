/**
 * Forensic audit: why ITM-1049 (ONION BRIDAL) outranks ITM-1050 (ONION BRIDAL 2).
 * Writes JSON report to scripts/.onion-1049-vs-1050-forensic.json
 */
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { PrismaClient, Prisma } from "@prisma/client";
import { loadPhotoBuffer } from "../src/lib/services/siglipSearch";
import { searchInventoryByDressCheckerEnterprise } from "../src/lib/dressChecker/enterpriseSearch";
import { analyzeQueryImage } from "../src/lib/dressChecker/processQuery";
import { compareFineGrainedFingerprints } from "../src/lib/dressChecker/fineGrainedScoring";
import { cosineSimilarity, cosineToPercent } from "../src/lib/siglipMath";
import type { FeatureFingerprint } from "../src/lib/dressChecker/types";
import type { IdentificationIndex, RegionEmbeddings } from "../src/lib/dressIdentificationTypes";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "../src/lib/dressChecker/types";
import { DRESS_CHECKER_ENGINE_VERSION } from "../src/lib/dressChecker/constants";

const prisma = new PrismaClient();
const SKUS = ["ITM-1049", "ITM-1050"] as const;

function asNumArr(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  if (!v.every((x) => typeof x === "number")) return null;
  return v as number[];
}

function embSim(a: number[] | null, b: number[] | null): number | null {
  if (!a?.length || !b?.length || a.length !== b.length) return null;
  return Math.round(cosineToPercent(cosineSimilarity(a, b)) * 10) / 10;
}

function hashOf(buf: Buffer | null): string | null {
  if (!buf?.length) return null;
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function shortJson(v: unknown, max = 400): unknown {
  if (v == null) return null;
  const s = JSON.stringify(v);
  if (s.length <= max) return v;
  return { _truncated: true, preview: s.slice(0, max), bytes: s.length };
}

function resolveFingerprint(item: {
  recognitionFingerprint: unknown;
  aiProfile: { recognitionFingerprint: unknown } | null;
}): FeatureFingerprint | null {
  const fp =
    (item.aiProfile?.recognitionFingerprint as FeatureFingerprint | null) ||
    (item.recognitionFingerprint as FeatureFingerprint | null);
  return fp?.primaryColour ? fp : null;
}

function resolveIndex(item: {
  identificationIndex: unknown;
  aiProfile: { garmentAttributes: unknown } | null;
}): IdentificationIndex | null {
  const fromItem = item.identificationIndex as IdentificationIndex | null;
  if (fromItem?.references?.length) return fromItem;
  const ga = item.aiProfile?.garmentAttributes as {
    identificationIndex?: IdentificationIndex;
  } | null;
  return ga?.identificationIndex?.references?.length ? ga.identificationIndex : null;
}

function primaryGlobal(index: IdentificationIndex | null): number[] | null {
  const g = index?.references?.[0]?.embeddings?.global;
  return asNumArr(g ?? null);
}

function bestPairEmbSim(
  a: IdentificationIndex | null,
  b: IdentificationIndex | null,
): { score: number | null; aLabel: string | null; bLabel: string | null } {
  if (!a?.references?.length || !b?.references?.length) {
    return { score: null, aLabel: null, bLabel: null };
  }
  let best = -1;
  let aLabel: string | null = null;
  let bLabel: string | null = null;
  for (const ra of a.references) {
    for (const rb of b.references) {
      const s = embSim(ra.embeddings.global, rb.embeddings.global);
      if (s != null && s > best) {
        best = s;
        aLabel = ra.label || ra.refId;
        bLabel = rb.label || rb.refId;
      }
    }
  }
  return { score: best < 0 ? null : best, aLabel, bLabel };
}

function regionBest(
  query: RegionEmbeddings,
  refs: IdentificationIndex["references"],
  key: keyof RegionEmbeddings,
): number | null {
  let best = -1;
  for (const r of refs) {
    const s = embSim(query[key], r.embeddings[key]);
    if (s != null && s > best) best = s;
  }
  return best < 0 ? null : best;
}

async function loadItem(sku: string) {
  const item = await prisma.clothingItem.findFirst({
    where: { sku },
    include: {
      referencePhotos: { orderBy: { sortOrder: "asc" } },
      aiProfile: true,
    },
  });
  if (!item) throw new Error(`Missing ${sku}`);

  const versions = await prisma.inventoryAiProfileVersion.findMany({
    where: { itemId: item.id },
    orderBy: { version: "desc" },
    take: 8,
    select: {
      id: true,
      version: true,
      createdAt: true,
      pipelineVersion: true,
      embeddingModel: true,
      embeddingModelVersion: true,
      sourceImages: true,
      embeddings: true,
    },
  });

  // pgvector presence + optional raw vector dump length via SQL
  const vecRows = await prisma.$queryRaw<
    Array<{ has_profile_vec: boolean; profile_dims: number | null }>
  >(Prisma.sql`
    SELECT
      (p.embedding_vector IS NOT NULL) AS has_profile_vec,
      CASE WHEN p.embedding_vector IS NOT NULL THEN vector_dims(p.embedding_vector) ELSE NULL END AS profile_dims
    FROM inventory_ai_profiles p
    WHERE p.item_id = ${item.id}
  `);

  const refVecRows = await prisma.$queryRaw<
    Array<{ id: number; has_vec: boolean; dims: number | null }>
  >(Prisma.sql`
    SELECT
      id,
      (embedding_vector IS NOT NULL) AS has_vec,
      CASE WHEN embedding_vector IS NOT NULL THEN vector_dims(embedding_vector) ELSE NULL END AS dims
    FROM clothing_item_reference_photos
    WHERE item_id = ${item.id}
    ORDER BY sort_order ASC, id ASC
  `);

  return { item, versions, vecRows: vecRows[0] ?? null, refVecRows };
}

async function main() {
  console.log("Loading ITM-1049 / ITM-1050…");
  const loaded = await Promise.all(SKUS.map((sku) => loadItem(sku)));
  const bySku = Object.fromEntries(loaded.map((l) => [l.item.sku, l]));

  const reports = [];

  for (const { item, versions, vecRows, refVecRows } of loaded) {
    const index = resolveIndex(item);
    const fp = resolveFingerprint(item);
    const profile = item.aiProfile;

    const catalogPaths = [
      item.photo,
      item.originalPhoto,
      item.enhancedPhoto,
      item.marketingPhoto,
      item.recognitionImage,
      profile?.recognitionImage,
      profile?.enhancedImage,
      ...item.referencePhotos.map((r) => r.photo),
    ].filter(Boolean) as string[];

    const refDetails = [];
    for (const r of item.referencePhotos) {
      const buf = await loadPhotoBuffer(r.photo);
      const idxRef = index?.references?.find(
        (x) => x.label === r.label || x.refId === String(r.id) || x.label === r.photo,
      );
      refDetails.push({
        id: r.id,
        photo: r.photo,
        label: r.label,
        sortOrder: r.sortOrder,
        contentHash: r.contentHash,
        fileSha256_16: hashOf(buf),
        bytes: buf?.length ?? null,
        indexedAt: r.indexedAt,
        lastIndexedAt: r.lastIndexedAt,
        hasEmbeddingJson: !!asNumArr(r.embeddingJson),
        embeddingJsonDim: asNumArr(r.embeddingJson)?.length ?? null,
        hasPgvector: refVecRows.find((x) => x.id === r.id)?.has_vec ?? false,
        pgvectorDims: refVecRows.find((x) => x.id === r.id)?.dims ?? null,
        indexRefLabel: idxRef?.label ?? null,
        indexRefId: idxRef?.refId ?? null,
        indexGlobalDim: idxRef?.embeddings?.global?.length ?? null,
      });
    }

    // Also check primary catalog photo buffer
    const primaryPath = item.originalPhoto || item.photo;
    const primaryBuf = primaryPath ? await loadPhotoBuffer(primaryPath) : null;

    reports.push({
      sku: item.sku,
      id: item.id,
      name: item.name,
      category: item.category,
      color: item.color,
      photos: {
        photo: item.photo,
        originalPhoto: item.originalPhoto,
        enhancedPhoto: item.enhancedPhoto,
        marketingPhoto: item.marketingPhoto,
        recognitionImage: item.recognitionImage,
        profileRecognitionImage: profile?.recognitionImage ?? null,
        profileEnhancedImage: profile?.enhancedImage ?? null,
        primaryPath,
        primarySha256_16: hashOf(primaryBuf),
        primaryBytes: primaryBuf?.length ?? null,
      },
      referencePhotos: refDetails,
      allPhotoUrls: catalogPaths,
      uniquePhotoUrls: [...new Set(catalogPaths)],
      duplicateUrlsWithinSku: catalogPaths.filter((u, i) => catalogPaths.indexOf(u) !== i),
      index: {
        hasIndex: !!index?.references?.length,
        refCount: index?.references?.length ?? 0,
        modelId: index?.modelId ?? null,
        version: index?.version ?? null,
        contentHash: index?.contentHash ?? null,
        indexedAt: index?.indexedAt ?? null,
        references: (index?.references ?? []).map((r) => ({
          refId: r.refId,
          label: r.label,
          colorFamily: r.colorFamily,
          globalDim: r.embeddings?.global?.length ?? 0,
          globalHead: (r.embeddings?.global ?? []).slice(0, 4),
          texture: r.texture,
        })),
      },
      fingerprint: fp
        ? {
            primaryColour: fp.primaryColour,
            secondaryColour: fp.secondaryColour,
            accentColours: fp.accentColours,
            colourFamily: fp.colourFamily,
            embroideryDensity: fp.embroideryDensity,
            embroideryStyle: fp.embroideryStyle,
            stoneWork: fp.stoneWork,
            mirrorWork: fp.mirrorWork,
            silhouette: fp.silhouette,
            garmentShape: fp.garmentShape,
            necklineShape: fp.necklineShape,
            sleeveLength: fp.sleeveLength,
            borderPattern: fp.borderPattern,
            motifDistribution: fp.motifDistribution,
            colourDiagnostics: fp.colourDiagnostics ?? null,
          }
        : null,
      signatures: profile
        ? {
            dominantColor: profile.dominantColor,
            secondaryColor: profile.secondaryColor,
            embroiderySignature: shortJson(profile.embroiderySignature),
            borderSignature: shortJson(profile.borderSignature),
            motifSignature: shortJson(profile.motifSignature),
            textureSignature: shortJson(profile.textureSignature),
            silhouetteSignature: shortJson(profile.silhouetteSignature),
            stoneSignature: shortJson(profile.stoneSignature),
            panelSignature: shortJson(profile.panelSignature),
            matchingVersion: profile.matchingVersion,
          }
        : null,
      versions: {
        pipelineVersion: profile?.pipelineVersion ?? null,
        recognitionVersion: profile?.recognitionVersion ?? null,
        engineExpected: DRESS_CHECKER_ENGINE_VERSION,
        fingerprintExpected: DRESS_CHECKER_FINGERPRINT_VERSION,
        pipelineIsV9:
          String(profile?.pipelineVersion ?? "") === String(DRESS_CHECKER_ENGINE_VERSION) ||
          String(profile?.pipelineVersion ?? "") === "9",
        recognitionIsV9: (profile?.recognitionVersion ?? 0) >= DRESS_CHECKER_FINGERPRINT_VERSION,
        reindexedAt: profile?.reindexedAt ?? null,
        lastIndexedAt: profile?.lastIndexedAt ?? null,
        lastProcessed: profile?.lastProcessed ?? null,
        identificationIndexedAt: item.identificationIndexedAt,
        siglipIndexedAt: item.siglipIndexedAt,
        modelVersion: profile?.modelVersion ?? null,
        status: profile?.status ?? null,
        currentVersion: profile?.currentVersion ?? null,
        hasImageEmbeddingJson: !!asNumArr(profile?.imageEmbeddingJson),
        imageEmbeddingDim: asNumArr(profile?.imageEmbeddingJson)?.length ?? null,
        hasPgvector: vecRows?.has_profile_vec ?? false,
        pgvectorDims: vecRows?.profile_dims ?? null,
        hasItemSiglipJson: !!asNumArr(item.siglipEmbedding),
        itemSiglipDim: asNumArr(item.siglipEmbedding)?.length ?? null,
      },
      versionHistory: versions.map((v) => ({
        version: v.version,
        createdAt: v.createdAt,
        pipelineVersion: v.pipelineVersion,
        embeddingModel: v.embeddingModel,
        embeddingModelVersion: v.embeddingModelVersion,
        sourceImages: v.sourceImages,
        hasEmbeddingsSnapshot: !!v.embeddings,
        embeddingsKeys:
          v.embeddings && typeof v.embeddings === "object"
            ? Object.keys(v.embeddings as object)
            : [],
      })),
    });
  }

  const a = bySku["ITM-1049"];
  const b = bySku["ITM-1050"];
  const indexA = resolveIndex(a.item);
  const indexB = resolveIndex(b.item);
  const fpA = resolveFingerprint(a.item);
  const fpB = resolveFingerprint(b.item);

  const urlsA = new Set(
    [
      a.item.photo,
      a.item.originalPhoto,
      a.item.enhancedPhoto,
      a.item.recognitionImage,
      ...a.item.referencePhotos.map((r) => r.photo),
    ].filter(Boolean) as string[],
  );
  const urlsB = new Set(
    [
      b.item.photo,
      b.item.originalPhoto,
      b.item.enhancedPhoto,
      b.item.recognitionImage,
      ...b.item.referencePhotos.map((r) => r.photo),
    ].filter(Boolean) as string[],
  );
  const crossDupes = [...urlsA].filter((u) => urlsB.has(u));

  // Content-hash cross check on primary + refs
  const hashMap = new Map<string, string[]>();
  for (const { item } of loaded) {
    const paths = [
      item.originalPhoto || item.photo,
      ...item.referencePhotos.map((r) => r.photo),
    ].filter(Boolean) as string[];
    for (const p of paths) {
      const buf = await loadPhotoBuffer(p);
      const h = hashOf(buf);
      if (!h) continue;
      const key = h;
      const list = hashMap.get(key) ?? [];
      list.push(`${item.sku}:${p}`);
      hashMap.set(key, list);
    }
  }
  const duplicateContent = [...hashMap.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([hash, paths]) => ({ hash, paths }));

  const pairEmb = bestPairEmbSim(indexA, indexB);
  const profileEmbSim = embSim(
    asNumArr(a.item.aiProfile?.imageEmbeddingJson),
    asNumArr(b.item.aiProfile?.imageEmbeddingJson),
  );
  const itemSiglipSim = embSim(asNumArr(a.item.siglipEmbedding), asNumArr(b.item.siglipEmbedding));

  const fgCompare =
    fpA && fpB ? compareFineGrainedFingerprints(fpA, fpB, a.item.category || "Lehenga") : null;

  // Query with ITM-1050 hanger/original photo (the dress that should win for "ONION BRIDAL 2")
  const queryPath = b.item.originalPhoto || b.item.photo;
  if (!queryPath) throw new Error("ITM-1050 has no photo for query");
  const queryBuf = await loadPhotoBuffer(queryPath);
  if (!queryBuf) throw new Error(`Could not load query photo ${queryPath}`);

  console.log("Analyzing query (ITM-1050 primary photo as hanger query)…");
  const query = await analyzeQueryImage(queryBuf, undefined, {
    category: "Lehenga",
    name: b.item.name,
  });

  const qGlobal = query.embeddings.global;
  const matrixRows = [];
  for (const { item } of loaded) {
    const index = resolveIndex(item);
    const fp = resolveFingerprint(item);
    const fg = fp
      ? compareFineGrainedFingerprints(query.fingerprint, fp, item.category || "Lehenga")
      : null;
    const refs = index?.references ?? [];
    matrixRows.push({
      sku: item.sku,
      name: item.name,
      embeddingSimilarity: refs.length ? regionBest(query.embeddings, refs, "global") : null,
      colourSimilarity: fg?.colorScore ?? null,
      motifSimilarity: fg?.motifScore ?? null,
      borderSimilarity: fg?.borderScore ?? null,
      panelSimilarity: fg?.panelScore ?? null,
      blouseSimilarity: fg?.blouseScore ?? null,
      stoneSimilarity: fg?.stoneScore ?? null,
      dupattaSimilarity: fg?.dupattaScore ?? null,
      fineGrainedScore: fg?.fineGrainedScore ?? null,
      borderRegionEmb: refs.length ? regionBest(query.embeddings, refs, "border") : null,
      embroideryRegionEmb: refs.length ? regionBest(query.embeddings, refs, "embroidery") : null,
      blouseRegionEmb: refs.length ? regionBest(query.embeddings, refs, "blouse") : null,
      skirtRegionEmb: refs.length ? regionBest(query.embeddings, refs, "skirt") : null,
      profileImageEmbVsQuery: embSim(qGlobal, asNumArr(item.aiProfile?.imageEmbeddingJson)),
      reasons: fg?.reasons ?? [],
    });
  }

  console.log("Running enterprise search (debug) with ITM-1050 photo…");
  const search = await searchInventoryByDressCheckerEnterprise(
    queryBuf,
    { category: "Lehenga" },
    { debug: true, limit: 20 },
  );

  const scored = ((search.ai_diagnostics as { scored?: Array<Record<string, unknown>> } | undefined)
    ?.scored ?? []) as Array<{
    itemId: number;
    sku?: string;
    name?: string;
    embeddingScore: number;
    fineGrainedScore: number;
    identityScore: number | null;
    textureScore: number | null;
    openAiScore: number;
    finalScore: number;
    rejected: boolean;
    rejectReason?: string;
    components?: Record<string, unknown>;
    reasoning?: string;
    bestRefLabel?: string;
  }>;

  const targetScores = scored
    .map((s, i) => ({ rank: i + 1, ...s }))
    .filter((s) => s.itemId === a.item.id || s.itemId === b.item.id);

  // Matching thumbnails actually used: identification index refs + catalog photo
  const matchingThumbnails = loaded.map(({ item }) => {
    const index = resolveIndex(item);
    return {
      sku: item.sku,
      catalogPhotoUsedInResults: item.photo,
      originalPhoto: item.originalPhoto,
      recognitionImage: item.aiProfile?.recognitionImage || item.recognitionImage,
      identificationRefs: (index?.references ?? []).map((r) => ({
        refId: r.refId,
        label: r.label,
        // label often encodes path or view name used at index time
      })),
      referencePhotoRows: item.referencePhotos.map((r) => ({
        id: r.id,
        label: r.label,
        photo: r.photo,
        sortOrder: r.sortOrder,
      })),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    engine: {
      DRESS_CHECKER_ENGINE_VERSION,
      DRESS_CHECKER_FINGERPRINT_VERSION,
    },
    query: {
      sourceSku: "ITM-1050",
      path: queryPath,
      sha256_16: hashOf(queryBuf),
      bytes: queryBuf.length,
      detected: {
        category: query.category,
        primaryColour: query.fingerprint.primaryColour,
        secondaryColour: query.fingerprint.secondaryColour,
        colourFamily: query.fingerprint.colourFamily,
        embroideryDensity: query.fingerprint.embroideryDensity,
        embroideryStyle: query.fingerprint.embroideryStyle,
        silhouette: query.fingerprint.silhouette,
        garmentShape: query.fingerprint.garmentShape,
        motifs: query.fingerprint.motifDistribution,
        colourDiagnostics: query.fingerprint.colourDiagnostics ?? null,
      },
      note: "Query uses ITM-1050 original/catalog photo as the hanger upload stand-in.",
    },
    items: reports,
    crossSku: {
      sharedExactUrls: crossDupes,
      duplicateContentHashes: duplicateContent,
      embeddingSimilarity_bestRefPair: pairEmb,
      embeddingSimilarity_profileJson: profileEmbSim,
      embeddingSimilarity_itemSiglipJson: itemSiglipSim,
      fingerprintCompare_1049_vs_1050: fgCompare,
      signatureSideBySide: {
        dominantColor: {
          "ITM-1049": a.item.aiProfile?.dominantColor,
          "ITM-1050": b.item.aiProfile?.dominantColor,
        },
        secondaryColor: {
          "ITM-1049": a.item.aiProfile?.secondaryColor,
          "ITM-1050": b.item.aiProfile?.secondaryColor,
        },
        embroidery: {
          "ITM-1049": shortJson(a.item.aiProfile?.embroiderySignature, 600),
          "ITM-1050": shortJson(b.item.aiProfile?.embroiderySignature, 600),
        },
        border: {
          "ITM-1049": shortJson(a.item.aiProfile?.borderSignature, 600),
          "ITM-1050": shortJson(b.item.aiProfile?.borderSignature, 600),
        },
        motif: {
          "ITM-1049": shortJson(a.item.aiProfile?.motifSignature, 600),
          "ITM-1050": shortJson(b.item.aiProfile?.motifSignature, 600),
        },
        panel: {
          "ITM-1049": shortJson(a.item.aiProfile?.panelSignature, 600),
          "ITM-1050": shortJson(b.item.aiProfile?.panelSignature, 600),
        },
        silhouette: {
          "ITM-1049": shortJson(a.item.aiProfile?.silhouetteSignature, 600),
          "ITM-1050": shortJson(b.item.aiProfile?.silhouetteSignature, 600),
        },
      },
    },
    similarityMatrix_queryVsItems: matrixRows,
    search: {
      decision: search.identification_meta,
      best_similarity: search.best_similarity,
      displayed: search.results.slice(0, 10).map((r, i) => ({
        rank: i + 1,
        sku: r.sku,
        name: r.name,
        similarity: r.similarity,
        embedding_score: r.embedding_score,
        fine_grained_score: r.fine_grained_score,
        color_score: r.color_score,
        border_score: r.border_score,
        motif_score: r.motif_score,
        openai_score: r.openai_score,
        confidence_band: r.confidence_band,
        rank_reason: r.rank_reason,
      })),
      targetScores,
      openai_verify: (search.ai_diagnostics as { openai_verify?: unknown } | undefined)?.openai_verify,
      query_detected: (search.ai_diagnostics as { query_detected?: unknown } | undefined)?.query_detected,
    },
    matchingThumbnails,
    forensicVerdict: null as null | Record<string, unknown>,
  };

  // Build verdict
  const s1049 = targetScores.find((s) => s.itemId === a.item.id);
  const s1050 = targetScores.find((s) => s.itemId === b.item.id);
  const m1049 = matrixRows.find((m) => m.sku === "ITM-1049");
  const m1050 = matrixRows.find((m) => m.sku === "ITM-1050");

  const reasons: string[] = [];
  if (crossDupes.length) {
    reasons.push(`Shared exact photo URLs across SKUs: ${crossDupes.join(", ")}`);
  }
  if (duplicateContent.length) {
    reasons.push(
      `Identical image bytes shared across paths: ${duplicateContent.map((d) => d.paths.join(" = ")).join("; ")}`,
    );
  }
  if (pairEmb.score != null && pairEmb.score >= 98) {
    reasons.push(
      `Best reference-pair embedding similarity is ${pairEmb.score}% (${pairEmb.aLabel} ↔ ${pairEmb.bLabel}) — near-duplicate visual embeddings.`,
    );
  }
  if (s1049 && s1050) {
    if (s1049.finalScore > s1050.finalScore) {
      reasons.push(
        `Search finalScore: ITM-1049=${s1049.finalScore} > ITM-1050=${s1050.finalScore} (embed ${s1049.embeddingScore} vs ${s1050.embeddingScore}, fg ${s1049.fineGrainedScore} vs ${s1050.fineGrainedScore}, gpt ${s1049.openAiScore} vs ${s1050.openAiScore}).`,
      );
    } else if (s1050.finalScore > s1049.finalScore) {
      reasons.push(
        `Search actually ranks ITM-1050 higher (final ${s1050.finalScore} vs ${s1049.finalScore}). Mis-ID may be UI/display or a different query photo.`,
      );
    }
  } else {
    if (!s1050) reasons.push("ITM-1050 missing from scored shortlist — recall/index problem.");
    if (!s1049) reasons.push("ITM-1049 missing from scored shortlist.");
  }
  if (!reports[0].versions.recognitionIsV9 || !reports[1].versions.recognitionIsV9) {
    reasons.push(
      `Recognition version not at v9: 1049=${reports[0].versions.recognitionVersion} 1050=${reports[1].versions.recognitionVersion}`,
    );
  }
  if (!reports[0].versions.pipelineIsV9 || !reports[1].versions.pipelineIsV9) {
    reasons.push(
      `Pipeline version not at 9: 1049=${reports[0].versions.pipelineVersion} 1050=${reports[1].versions.pipelineVersion}`,
    );
  }
  if (m1049 && m1050 && (m1049.embeddingSimilarity ?? 0) > (m1050.embeddingSimilarity ?? 0) + 2) {
    reasons.push(
      `Query embedding is closer to ITM-1049 refs (${m1049.embeddingSimilarity}%) than ITM-1050 (${m1050.embeddingSimilarity}%) — unexpected if query is ITM-1050's own photo; suggests index/ref mix-up or near-identical garments.`,
    );
  }

  report.forensicVerdict = {
    summary:
      s1049 && s1050 && s1049.finalScore >= s1050.finalScore
        ? "ITM-1049 outranks or ties ITM-1050 on an ITM-1050 hanger/catalog query — investigate near-duplicate embeddings / shared refs / GPT verify bias."
        : s1050 && s1049 && s1050.finalScore > s1049.finalScore
          ? "ITM-1050 correctly outranks ITM-1049 on its own photo in this run — reproduce with the exact uploaded hanger file if mis-ID persists."
          : "Incomplete shortlist — see reasons.",
    why1049Wins: reasons,
    scores: { s1049, s1050, m1049, m1050 },
  };

  const outDir = join(process.cwd(), "scripts");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, ".onion-1049-vs-1050-forensic.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log("\n=== FORENSIC VERDICT ===");
  console.log(JSON.stringify(report.forensicVerdict, null, 2));
  console.log("\nWrote", outPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
