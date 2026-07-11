import { JEWELLERY_CATEGORIES } from "../constants";
import { normalizeImageBuffer } from "../photoHash";
import { describeDressImage } from "../dressFingerprint";
import { generateVisionMetadataFromOpenAi } from "@/lib/ai/openaiVision";
import type {
  GarmentAttributes,
  JewelleryAttributes,
  VisionMetadata,
  ColourAnalysis,
} from "./types";

function heuristicMetadata(
  category: string,
  itemType: string,
  colourHints: Partial<ColourAnalysis>,
): VisionMetadata {
  const isJewellery = itemType === "jewellery" || JEWELLERY_CATEGORIES.includes(category);
  const primary = colourHints.primary || "Unknown";
  const tags = [category, primary, isJewellery ? "Jewellery" : "Clothing"].filter(Boolean);

  if (isJewellery) {
    return {
      description: `${primary} ${category} jewellery piece from our rental collection.`,
      tags,
      garmentAttributes: {},
      jewelleryAttributes: {
        jewelleryCategory: category,
        stoneColour: primary,
        completeSet: false,
        traditionalStyle: true,
      },
      colourHints: colourHints,
    };
  }

  return {
    description: `${primary} ${category} outfit featuring traditional Indian craftsmanship, suitable for festive and wedding occasions.`,
    tags: [...tags, "Festive", "Traditional"],
    garmentAttributes: {
      category,
      occasion: "Festive",
      style: category,
    },
    jewelleryAttributes: {},
    colourHints: colourHints,
  };
}

async function generateWithVision(
  imageBuffer: Buffer,
  category: string,
  itemType: string,
): Promise<VisionMetadata> {
  const processedBuffer = await normalizeImageBuffer(imageBuffer);
  const isJewellery = itemType === "jewellery" || JEWELLERY_CATEGORIES.includes(category);
  const parsed = await generateVisionMetadataFromOpenAi(processedBuffer, {
    category,
    itemType,
  });
  const primaryColours = Array.isArray(parsed.primaryColours)
    ? parsed.primaryColours.filter(Boolean).map(String)
    : [];
  const secondaryColours = Array.isArray(parsed.secondaryColours)
    ? parsed.secondaryColours.filter(Boolean).map(String)
    : [];
  const motifs = Array.isArray(parsed.motifs) ? parsed.motifs.filter(Boolean).map(String) : [];
  const tags = [category, parsed.subcategory, ...primaryColours, parsed.embroideryType, parsed.occasion, ...motifs]
    .filter(Boolean)
    .map((value) => String(value));

  return {
    description:
      String(parsed.visualDescription || "").trim() || `${category} rental piece`,
    tags,
    garmentAttributes: isJewellery
      ? {}
      : ({
          category,
          subcategory: parsed.subcategory,
          gender: parsed.gender,
          occasion: parsed.occasion,
          style: parsed.subcategory,
          silhouette: parsed.silhouette,
          sleeveType: parsed.sleeveStyle,
          neckType: parsed.neckline,
          fabricType: parsed.fabric,
          embroideryType: parsed.embroideryType,
          borderStyle: parsed.borderStyle,
          pattern: parsed.pattern,
          texture: parsed.texture,
        } satisfies GarmentAttributes),
    jewelleryAttributes: isJewellery
      ? ({
          jewelleryCategory: parsed.jewelleryType || category,
          materialAppearance: parsed.texture,
          stoneColour: primaryColours[0] || undefined,
          necklaceType: parsed.subcategory,
        } satisfies JewelleryAttributes)
      : {},
    colourHints: {
      primary: primaryColours[0],
      secondary: secondaryColours[0],
      accents: secondaryColours.slice(1),
    },
  };
}

/** Generate vision metadata — OpenAI Vision when available, dress fingerprint + heuristics as fallback. */
export async function generateVisionMetadata(
  imageBuffer: Buffer,
  category: string,
  itemType: string,
  colourHints: Partial<ColourAnalysis> = {},
): Promise<VisionMetadata> {
  try {
    return await generateWithVision(imageBuffer, category, itemType);
  } catch {
    try {
      const fp = await describeDressImage(imageBuffer);
      const tags = [
        fp.style,
        fp.primaryColor,
        fp.secondaryColor,
        fp.embroideryStyle,
        fp.occasion,
        fp.fabric,
        category,
      ].filter(Boolean);
      return {
        description: `${fp.primaryColor} ${fp.style} featuring ${fp.embroideryPattern.toLowerCase()} with ${fp.embroideryStyle.toLowerCase()}, ${fp.borderDesign}. ${fp.distinctiveFeatures}`,
        tags,
        garmentAttributes: {
          category,
          style: fp.style,
          occasion: fp.occasion,
          fabricType: fp.fabric,
          embroideryType: fp.embroideryStyle,
          pattern: fp.embroideryPattern,
          borderStyle: fp.borderDesign,
        },
        jewelleryAttributes: {},
        colourHints: {
          primary: fp.primaryColor,
          secondary: fp.secondaryColor,
          ...colourHints,
        },
      };
    } catch {
      return heuristicMetadata(category, itemType, colourHints);
    }
  }
}
