import type {
  ColourAnalysis,
  GarmentAttributes,
  HealthIssue,
  QualityScores,
  SourceImages,
} from "./types";

type HealthInput = {
  hasPhoto: boolean;
  sourceImages: SourceImages;
  qualityScores: QualityScores | null;
  colourAnalysis: ColourAnalysis | null;
  garmentAttributes: GarmentAttributes | null;
  description: string | null;
  tags: string[];
  duplicateFingerprint: unknown;
  identificationIndexedAt: Date | null;
  recognitionImage: string | null;
  profileStatus: string;
};

export function computeHealthScore(input: HealthInput): { score: number; issues: HealthIssue[] } {
  const issues: HealthIssue[] = [];
  let score = 100;

  if (!input.hasPhoto) {
    issues.push({ code: "missing_images", severity: "high", message: "No photo uploaded" });
    return { score: 0, issues };
  }

  if (!input.sourceImages.original) {
    issues.push({ code: "missing_original", severity: "medium", message: "Original image not preserved" });
    score -= 10;
  }
  if (!input.sourceImages.recognition && !input.recognitionImage) {
    issues.push({ code: "missing_recognition", severity: "medium", message: "Recognition image not generated" });
    score -= 12;
  }
  if (!input.identificationIndexedAt) {
    issues.push({ code: "missing_embeddings", severity: "medium", message: "Search embeddings not indexed" });
    score -= 15;
  }

  const q = input.qualityScores;
  if (q) {
    if (q.sharpness < 40) {
      issues.push({ code: "blurry", severity: "high", message: "Image appears blurry" });
      score -= 20;
    } else if (q.sharpness < 60) {
      issues.push({ code: "low_sharpness", severity: "medium", message: "Image sharpness is below catalogue standard" });
      score -= 10;
    }
    if (q.overallCatalogueQuality < 50) {
      issues.push({ code: "low_catalogue_quality", severity: "medium", message: "Catalogue quality score is low" });
      score -= 12;
    }
    if (q.overallRecognitionQuality < 50) {
      issues.push({ code: "low_recognition_quality", severity: "medium", message: "Recognition quality score is low" });
      score -= 10;
    }
  } else {
    issues.push({ code: "missing_quality", severity: "low", message: "Quality scores not computed" });
    score -= 5;
  }

  if (!input.description?.trim()) {
    issues.push({ code: "missing_description", severity: "medium", message: "AI description not generated" });
    score -= 8;
  }
  if (!input.tags.length) {
    issues.push({ code: "missing_tags", severity: "low", message: "No searchable tags" });
    score -= 5;
  }
  if (!input.colourAnalysis?.primary) {
    issues.push({ code: "missing_colours", severity: "low", message: "Colour analysis incomplete" });
    score -= 5;
  }
  if (!input.garmentAttributes?.style && !input.garmentAttributes?.category) {
    issues.push({ code: "missing_attributes", severity: "low", message: "Garment attributes incomplete" });
    score -= 5;
  }
  if (!input.duplicateFingerprint) {
    issues.push({ code: "missing_duplicate_fp", severity: "low", message: "Duplicate detection fingerprint missing" });
    score -= 5;
  }
  if (input.profileStatus === "failed") {
    issues.push({ code: "profile_failed", severity: "high", message: "AI profile generation failed" });
    score -= 25;
  } else if (input.profileStatus === "processing" || input.profileStatus === "pending") {
    issues.push({ code: "incomplete_profile", severity: "low", message: "AI profile still processing" });
    score -= 3;
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), issues };
}
