/**

 * Dress Checker Engine v7 — production identity fingerprint matching.

 * Weighted 7-component scoring; colour is minor (5%), not dominant.

 */



/** Final match weights — must sum to 1. */

export const FINGERPRINT_MATCH_WEIGHTS = {

  /** Global visual embedding */

  global: 0.2,

  /** Chest / centre / sleeve embroidery regions */

  embroidery: 0.25,

  /** Bottom 15% border crop — strongest identity cue for lehengas */

  border: 0.2,

  /** Motif distribution + pattern histogram */

  motifs: 0.15,

  /** Dominant colour palette histogram */

  colour: 0.05,

  /** Fabric texture descriptor */

  texture: 0.1,

  /** Garment shape / silhouette */

  silhouette: 0.05,

} as const;



/** @deprecated v6 region breakdown — retained for partial-view overrides */

export const IDENTITY_REGION_WEIGHTS_V6 = {

  embroidery: FINGERPRINT_MATCH_WEIGHTS.embroidery,

  border: FINGERPRINT_MATCH_WEIGHTS.border,

  motifs: FINGERPRINT_MATCH_WEIGHTS.motifs,

  skirt: FINGERPRINT_MATCH_WEIGHTS.silhouette,

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

    embroidery: 0.2,

    border: 0.2,

    motifs: 0.1,

    skirt: 0.35,

    blouse: 0,

    neckline: 0,

    sleeve: 0,

    dupatta: 0.05,

    texture: 0.05,

    global: 0.05,

    colour: 0,

  },

  blouse: {

    embroidery: 0.3,

    border: 0.1,

    motifs: 0.1,

    skirt: 0,

    blouse: 0.35,

    neckline: 0.1,

    sleeve: 0.05,

    dupatta: 0,

    texture: 0.05,

    global: 0,

    colour: 0,

  },

  dupatta: {

    embroidery: 0.2,

    border: 0.2,

    motifs: 0.1,

    skirt: 0,

    blouse: 0,

    neckline: 0,

    sleeve: 0,

    dupatta: 0.35,

    texture: 0.1,

    global: 0.05,

    colour: 0,

  },

  embroidery_closeup: {

    embroidery: 0.45,

    border: 0.2,

    motifs: 0.15,

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

  regional: 0.8,

  global: 0.12,

  geometric: 0.08,

} as const;



export const CONFIDENCE_THRESHOLDS = {

  /** Same dress — auto-identify */

  sameDress: 95,

  /** Very likely — ask confirmation */

  veryLikely: 90,

  /** Possible match */

  possible: 70,

  unreliable: 70,

} as const;



/** Duplicate inventory warning threshold */

export const DUPLICATE_SIMILARITY_THRESHOLD = 98;



export const RETRIEVAL_LIMITS = {

  stage1GlobalTop: 20,

  afterIdentityRerank: 10,

  finalResults: 5,

} as const;



export const DRESS_CHECKER_ENGINE_VERSION = 7;

export const DRESS_CHECKER_FEATURE_VERSION = 2;

export const RECOGNITION_IMAGE_SIZE = 768;



export const QUERY_ROTATION_DEGREES = [0, 90, 180, 270] as const;

export const GEOMETRIC_PASS_THRESHOLD = 32;


