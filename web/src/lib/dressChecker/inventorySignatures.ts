import type { FeatureFingerprint } from "./types";
import {
  buildLocalKeypointSignatures,
  type LocalKeypointSignatures,
} from "./viewInvariantMatching";
import {
  buildBridalIdentityHashes,
  type BridalIdentityHashes,
} from "./bridalIdentityHashes";

export type EmbroiderySignature = {
  style: string;
  density: number;
  threadPattern: number[];
  stoneWork: boolean;
  mirrorWork: boolean;
};

export type BorderSignature = {
  averageHash: string;
  differenceHash: string;
  widthRatio: number;
  borderKeypoints?: number[];
};

export type MotifSignature = {
  distribution: number[];
  dupattaPattern: string | null;
  motifKeypoints?: number[];
};

export type TextureSignature = {
  fabricDescriptor: number[];
  textureFeatures: number[];
};

export type SilhouetteSignature = {
  silhouette: string;
  garmentShape: string;
  sleeveLength: string;
  necklineShape: string;
  bounds: FeatureFingerprint["garmentBounds"];
};

export type StoneSignature = {
  stoneWork: boolean;
  mirrorWork: boolean;
  density: number;
  densityMap: number[];
};

export type PanelSignature = {
  silhouette: string;
  garmentShape: string;
  bounds: FeatureFingerprint["garmentBounds"];
  localDescriptors: number[];
  panelKeypoints?: number[];
};

export type InventorySignatures = {
  dominantColor: string;
  secondaryColor: string;
  embroidery: EmbroiderySignature;
  border: BorderSignature;
  motif: MotifSignature;
  texture: TextureSignature;
  silhouette: SilhouetteSignature;
  stone: StoneSignature;
  panel: PanelSignature;
  keypoints: LocalKeypointSignatures;
  /** PART 6 — near-duplicate bridal discrimination hashes (pre-GPT) */
  bridalHashes: BridalIdentityHashes;
};

/** Serialize identity signatures + bridal hashes from a feature fingerprint. */
export function buildInventorySignatures(fp: FeatureFingerprint): InventorySignatures {
  const stoneDensity = fp.stoneWork
    ? Math.min(100, fp.embroideryDensity + 20)
    : fp.embroideryDensity * 0.4;

  const keypoints = buildLocalKeypointSignatures(fp);
  const bridalHashes = buildBridalIdentityHashes(fp);

  return {
    dominantColor: fp.primaryColour,
    secondaryColor: fp.secondaryColour,
    embroidery: {
      style: fp.embroideryStyle,
      density: fp.embroideryDensity,
      threadPattern: fp.threadPattern,
      stoneWork: fp.stoneWork,
      mirrorWork: fp.mirrorWork,
    },
    border: {
      ...fp.borderPattern,
      borderKeypoints: keypoints.borderKeypoints,
    },
    motif: {
      distribution: fp.motifDistribution,
      dupattaPattern: fp.dupattaPattern,
      motifKeypoints: keypoints.motifKeypoints,
    },
    texture: {
      fabricDescriptor: fp.fabricTextureDescriptor,
      textureFeatures: fp.textureFeatures,
    },
    silhouette: {
      silhouette: fp.silhouette,
      garmentShape: fp.garmentShape,
      sleeveLength: fp.sleeveLength,
      necklineShape: fp.necklineShape,
      bounds: fp.garmentBounds,
    },
    stone: {
      stoneWork: fp.stoneWork,
      mirrorWork: fp.mirrorWork,
      density: stoneDensity,
      densityMap: [
        stoneDensity,
        fp.embroideryDensity,
        fp.stoneWork ? 1 : 0,
        fp.mirrorWork ? 1 : 0,
        ...fp.threadPattern.slice(0, 4),
      ],
    },
    panel: {
      silhouette: fp.silhouette,
      garmentShape: fp.garmentShape,
      bounds: fp.garmentBounds,
      localDescriptors: fp.localDescriptors,
      panelKeypoints: keypoints.panelKeypoints,
    },
    keypoints,
    bridalHashes,
  };
}
