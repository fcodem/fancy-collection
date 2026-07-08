import type {

  ComponentScores,

  IdentificationIndex,

  QueryReferenceFingerprint,

} from "../dressIdentificationTypes";

import type { PartialViewType } from "./partialViewDetection";

import { verifyGeometricAlignment } from "./geometricVerification";

import {

  computeWeightedFingerprintScore,

  globalEmbeddingScore,

  matchRegionEmbeddings,

} from "./regionEmbeddingMatch";

import {

  CONFIDENCE_THRESHOLDS,

  FINGERPRINT_MATCH_WEIGHTS,

  GEOMETRIC_PASS_THRESHOLD,

} from "./constants";

import type { FeatureFingerprint, IdentityScores } from "./types";



export type IdentitySearchInput = {

  queryViews: QueryReferenceFingerprint[];

  queryFingerprint: FeatureFingerprint;

  inventoryIndex: IdentificationIndex;

  inventoryFingerprint: FeatureFingerprint | null;

  partialView: PartialViewType;

};



export type IdentitySearchResult = {

  identity: IdentityScores;

  stage1Global: number;

  stage2Regional: number;

  stage3Geometric: number;

  rejected: boolean;

  rejectReason?: string;

};



function buildComponentScores(region: ReturnType<typeof matchRegionEmbeddings>): ComponentScores {

  return {

    global: region.global,

    border: region.border,

    blouse: region.blouse,

    skirt: region.skirt,

    embroidery: region.embroidery,

    texture: region.texture,

    color: region.colour,

    metadataColor: region.colour,

    weighted: region.regional,

  };

}



function applyIdentityCaps(

  raw: number,

  embroidery: number,

  border: number,

  geometric: number,

  global: number,

  categoryMismatch: boolean,

): number {

  let final = raw;

  const identityCore = Math.round(embroidery * 0.35 + border * 0.3 + geometric * 0.2 + global * 0.15);



  if (categoryMismatch) final = Math.min(final, 30);

  if (identityCore < 45) final = Math.min(final, 55);

  if (identityCore < 55) final = Math.min(final, 65);

  if (embroidery < 50 && border < 50) final = Math.min(final, 58);

  if (geometric < GEOMETRIC_PASS_THRESHOLD && identityCore < 60) {

    final = Math.min(final, Math.max(geometric + 15, 45));

  }



  return Math.min(100, Math.max(0, final));

}



/**

 * v7 identity search — weighted fingerprint comparison:

 * global 20% · embroidery 25% · border 20% · motifs 15% · colour 5% · texture 10% · silhouette 5%

 */

export function searchGarmentIdentity(input: IdentitySearchInput): IdentitySearchResult {

  const { queryViews, queryFingerprint: q, inventoryIndex, inventoryFingerprint: stored, partialView } =

    input;

  const refs = inventoryIndex.references;



  const stage1Global = globalEmbeddingScore(queryViews, refs);

  const region = matchRegionEmbeddings(queryViews, refs, q, stored, partialView);

  const stage2Regional = region.regional;



  let stage3Geometric = 0;

  let rejected = false;

  let rejectReason: string | undefined;



  if (stored) {

    const geo = verifyGeometricAlignment(q, stored);

    stage3Geometric = geo.score;

    if (!geo.passed && stage2Regional < 72) {

      rejected = true;

      rejectReason = geo.rejectReason;

    }

  } else {

    stage3Geometric = Math.round((region.embroidery + region.border) / 2);

  }



  const categoryMismatch = !!(stored && q.category !== stored.category);



  const weightedFinal = computeWeightedFingerprintScore({

    global: region.global,

    embroidery: region.embroidery,

    border: region.border,

    motifs: region.motifs,

    colour: region.colour,

    texture: region.texture,

    silhouette: region.silhouette,

  });



  const rawFinal = Math.round(weightedFinal * 0.92 + stage3Geometric * 0.08);



  let final = applyIdentityCaps(

    rawFinal,

    region.embroidery,

    region.border,

    stage3Geometric,

    region.global,

    categoryMismatch,

  );



  if (rejected) {

    final = Math.min(final, CONFIDENCE_THRESHOLDS.possible - 1);

  }



  const identity: IdentityScores = {

    embroidery: region.embroidery,

    border: region.border,

    texture: region.texture,

    silhouette: region.silhouette,

    motifs: region.motifs,

    deepEmbedding: region.global,

    neckline: region.neckline,

    sleeve: region.sleeve,

    colour: region.colour,

    keypoints: stage3Geometric,

    dupatta: region.dupatta,

    final,

    weights: FINGERPRINT_MATCH_WEIGHTS,

    bestRefId: region.bestRefId,

    bestRefLabel: region.bestRefLabel,

    bestQuerySource: region.bestQuerySource,

    embeddingComponents: buildComponentScores(region),

  };



  return {

    identity,

    stage1Global,

    stage2Regional,

    stage3Geometric,

    rejected,

    rejectReason,

  };

}



/** Stage 1 pre-filter score for catalog-wide global embedding search. */

export function stage1GlobalScore(

  queryViews: QueryReferenceFingerprint[],

  references: import("../dressIdentificationTypes").StoredReferenceFingerprint[],

): number {

  return globalEmbeddingScore(queryViews, references);

}


