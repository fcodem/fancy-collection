/**
 * Dress Checker Engine v9 — view-invariant rental identity matching.
 * Border / motif / embroidery / panel dominate; global embedding is 15% (not pose-sensitive).
 */

import { ENTERPRISE_MATCH_WEIGHTS, ENTERPRISE_DISPLAY_THRESHOLDS } from "./enterpriseMatchScore";

/**
 * Final match weights — must sum to 1 (GPT is a separate 5% blend in search).
 * Spec: border 40%, motif 20%, embroidery 15%, panel 10%, embedding 10%, colour 5%.
 */
export const FINGERPRINT_MATCH_WEIGHTS = {
  border: ENTERPRISE_MATCH_WEIGHTS.border,
  motifs: ENTERPRISE_MATCH_WEIGHTS.motif,
  embroidery: ENTERPRISE_MATCH_WEIGHTS.embroidery,
  panel: ENTERPRISE_MATCH_WEIGHTS.panel,
  global: ENTERPRISE_MATCH_WEIGHTS.embedding,
  colour: ENTERPRISE_MATCH_WEIGHTS.colour,
  texture: 0,
  silhouette: 0,
} as const;

/** @deprecated v6 region breakdown — retained for partial-view overrides */
export const IDENTITY_REGION_WEIGHTS_V6 = {
  embroidery: FINGERPRINT_MATCH_WEIGHTS.embroidery,
  border: FINGERPRINT_MATCH_WEIGHTS.border,
  motifs: 0.1,
  skirt: 0.05,
  blouse: 0,
  neckline: 0,
  sleeve: 0,
  dupatta: 0,
  texture: FINGERPRINT_MATCH_WEIGHTS.texture,
  global: FINGERPRINT_MATCH_WEIGHTS.global,
  colour: FINGERPRINT_MATCH_WEIGHTS.colour,
} as const;

/** Partial-view region weights — boost the visible region. */
export const PARTIAL_REGION_WEIGHTS_V6 = {
  skirt: {
    embroidery: 0.35,
    border: 0.25,
    motifs: 0.05,
    skirt: 0.2,
    blouse: 0,
    neckline: 0,
    sleeve: 0,
    dupatta: 0.05,
    texture: 0.05,
    global: 0.05,
    colour: 0,
  },
  blouse: {
    embroidery: 0.45,
    border: 0.2,
    motifs: 0.05,
    skirt: 0,
    blouse: 0.15,
    neckline: 0.05,
    sleeve: 0.05,
    dupatta: 0,
    texture: 0.05,
    global: 0,
    colour: 0,
  },
  dupatta: {
    embroidery: 0.3,
    border: 0.25,
    motifs: 0.05,
    skirt: 0,
    blouse: 0,
    neckline: 0,
    sleeve: 0,
    dupatta: 0.25,
    texture: 0.1,
    global: 0.05,
    colour: 0,
  },
  embroidery_closeup: {
    embroidery: 0.55,
    border: 0.2,
    motifs: 0.05,
    skirt: 0.05,
    blouse: 0.05,
    neckline: 0,
    sleeve: 0,
    dupatta: 0,
    texture: 0.1,
    global: 0,
    colour: 0,
  },
} as const;

/** @deprecated v5 alias */
export const IDENTITY_WEIGHTS_V5 = FINGERPRINT_MATCH_WEIGHTS;
export const IDENTITY_WEIGHTS_V4 = FINGERPRINT_MATCH_WEIGHTS;
export const HYBRID_WEIGHTS_V3 = FINGERPRINT_MATCH_WEIGHTS;

export const STAGE_FINAL_WEIGHTS_V6 = {
  regional: 0.92,
  global: 0.05,
  geometric: 0.03,
} as const;

/** Enterprise display thresholds — 95+ exact, 85–95 highly likely, 70–85 possible, <70 different */
export const CONFIDENCE_THRESHOLDS = {
  sameDress: ENTERPRISE_DISPLAY_THRESHOLDS.exactMatch,
  veryLikely: ENTERPRISE_DISPLAY_THRESHOLDS.highlyLikely,
  possible: ENTERPRISE_DISPLAY_THRESHOLDS.possibleMatch,
  unreliable: ENTERPRISE_DISPLAY_THRESHOLDS.minimumDisplay,
} as const;

/** Duplicate inventory warning threshold */
export const DUPLICATE_SIMILARITY_THRESHOLD = 98;

export const RETRIEVAL_LIMITS = {
  stage1GlobalTop: 20,
  afterIdentityRerank: 10,
  finalResults: 5,
} as const;

export const DRESS_CHECKER_ENGINE_VERSION = 9;
export const DRESS_CHECKER_FEATURE_VERSION = 3;
export const RECOGNITION_IMAGE_SIZE = 768;

/** Query rotation variants — handles folded/hanging/worn orientations */
export const QUERY_ROTATION_DEGREES = [0, 90, 180, 270] as const;
export const GEOMETRIC_PASS_THRESHOLD = 32;

/** Reference photo labels for multi-view indexing */
export const REFERENCE_PHOTO_LABELS = [
  "hanger",
  "mannequin",
  "folded",
  "customer",
  "front",
  "detail",
] as const;
