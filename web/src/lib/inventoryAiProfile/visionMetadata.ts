import Anthropic from "@anthropic-ai/sdk";
import { JEWELLERY_CATEGORIES } from "../constants";
import { normalizeImageBuffer } from "../photoHash";
import { describeDressImage } from "../dressFingerprint";
import { AI_PROFILE_VISION_MODEL } from "./constants";
import type {
  GarmentAttributes,
  JewelleryAttributes,
  VisionMetadata,
  ColourAnalysis,
} from "./types";

function anthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

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
  const client = anthropicClient();
  if (!client) throw new Error("no_vision_api");

  const processedBuffer = await normalizeImageBuffer(imageBuffer);
  const base64Image = processedBuffer.toString("base64");
  const isJewellery = itemType === "jewellery" || JEWELLERY_CATEGORIES.includes(category);

  const systemPrompt = `You are an expert Indian fashion cataloguer for a cloth rental business.
Return ONLY valid JSON. No markdown. No code fences.`;

  const userPrompt = isJewellery
    ? `Analyse this jewellery image. Return JSON:
{
  "description": "professional 1-2 sentence catalogue description",
  "tags": ["searchable", "tags", "array"],
  "colourHints": { "primary": "", "secondary": "", "accents": [] },
  "jewelleryAttributes": {
    "jewelleryCategory": "", "materialAppearance": "", "stoneColour": "",
    "necklaceType": "", "earringType": "", "maangTikka": false, "bangles": false,
    "ring": false, "completeSet": false, "traditionalStyle": true, "modernStyle": false
  }
}`
    : `Analyse this garment image. Return JSON:
{
  "description": "professional 1-2 sentence catalogue description",
  "tags": ["searchable", "tags", "array"],
  "colourHints": { "primary": "", "secondary": "", "accents": [] },
  "garmentAttributes": {
    "category": "", "subcategory": "", "gender": "", "occasion": "", "style": "",
    "silhouette": "", "sleeveType": "", "neckType": "", "length": "", "fabricType": "",
    "embroideryType": "", "stoneWork": false, "mirrorWork": false, "sequinWork": false,
    "borderStyle": "", "dupattaStyle": "", "blouseStyle": "", "pattern": "", "print": "",
    "texture": "", "fitStyle": ""
  }
}`;

  const response = await client.messages.create({
    model: AI_PROFILE_VISION_MODEL,
    max_tokens: 900,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: base64Image },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const raw = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(raw) as {
    description?: string;
    tags?: string[];
    colourHints?: Partial<ColourAnalysis>;
    garmentAttributes?: GarmentAttributes;
    jewelleryAttributes?: JewelleryAttributes;
  };

  return {
    description: parsed.description || `${category} rental piece`,
    tags: (parsed.tags || []).map((t) => String(t).trim()).filter(Boolean),
    garmentAttributes: parsed.garmentAttributes || {},
    jewelleryAttributes: parsed.jewelleryAttributes || {},
    colourHints: parsed.colourHints,
  };
}

/** Generate vision metadata — Claude Vision when available, dress fingerprint + heuristics as fallback. */
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
