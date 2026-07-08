import type {
  CandidateFilterStage,
  RecognitionFeatureFingerprint,
  StoredRecognitionProfile,
} from "./types";

function primaryColourMatch(q: RecognitionFeatureFingerprint, s: RecognitionFeatureFingerprint): boolean {
  if (q.colourFamily === "multi" || s.colourFamily === "multi") return true;
  return q.primaryColour === s.primaryColour || q.colourFamily === s.colourFamily;
}

function embroideryDensityBand(d: number): string {
  if (d > 20) return "heavy";
  if (d > 10) return "moderate";
  if (d > 4) return "light";
  return "minimal";
}

function borderBand(widthRatio: number): string {
  if (widthRatio > 0.2) return "wide";
  if (widthRatio > 0.12) return "medium";
  return "narrow";
}

export function filterCandidates(
  query: RecognitionFeatureFingerprint,
  candidates: StoredRecognitionProfile[],
): { filtered: StoredRecognitionProfile[]; stages: CandidateFilterStage[] } {
  const stages: CandidateFilterStage[] = [];
  let pool = [...candidates];

  const stage1 = pool.filter((c) => {
    const fp = c.fingerprint;
    if (!fp) return false;
    return fp.categoryGroup === query.categoryGroup;
  });
  stages.push({ stage: 1, name: "category_group", before: pool.length, after: stage1.length });
  pool = stage1.length ? stage1 : pool;

  const stage2 = pool.filter((c) => {
    const fp = c.fingerprint;
    if (!fp) return true;
    if (!query.category) return true;
    return fp.category === query.category || query.categoryGroup === "jewellery";
  });
  stages.push({ stage: 2, name: "category", before: pool.length, after: stage2.length });
  pool = stage2.length ? stage2 : pool;

  const stage2b = pool.filter((c) => {
    const fp = c.fingerprint;
    if (!fp || !query.subCategory) return true;
    return fp.subCategory === query.subCategory || fp.category === query.category;
  });
  stages.push({ stage: 3, name: "sub_category", before: pool.length, after: stage2b.length });
  pool = stage2b.length >= 2 ? stage2b : pool;

  const stage3 = pool.filter((c) => {
    const fp = c.fingerprint;
    if (!fp) return true;
    return primaryColourMatch(query, fp);
  });
  stages.push({ stage: 4, name: "primary_colour", before: pool.length, after: stage3.length });
  pool = stage3.length >= 3 ? stage3 : pool;

  const qEmbBand = embroideryDensityBand(query.embroideryDensity);
  const stage4 = pool.filter((c) => {
    const fp = c.fingerprint;
    if (!fp) return true;
    return embroideryDensityBand(fp.embroideryDensity) === qEmbBand || Math.abs(fp.embroideryDensity - query.embroideryDensity) < 12;
  });
  stages.push({ stage: 5, name: "embroidery_density", before: pool.length, after: stage4.length });
  pool = stage4.length >= 2 ? stage4 : pool;

  const qBorder = borderBand(query.borderPattern.widthRatio);
  const stage5 = pool.filter((c) => {
    const fp = c.fingerprint;
    if (!fp) return true;
    return borderBand(fp.borderPattern.widthRatio) === qBorder;
  });
  stages.push({ stage: 6, name: "border_pattern", before: pool.length, after: stage5.length });
  pool = stage5.length >= 2 ? stage5 : pool;

  stages.push({ stage: 7, name: "siglip_similarity", before: pool.length, after: pool.length });
  stages.push({ stage: 8, name: "hybrid_score", before: pool.length, after: pool.length });

  return { filtered: pool, stages };
}
