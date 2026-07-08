import type {
  ColourAnalysis,
  CustomerSafeProfile,
  GarmentAttributes,
  InternalProfile,
  JewelleryAttributes,
  QualityScores,
  HealthIssue,
} from "./types";

type ProfileRow = {
  itemId: number;
  status: string;
  description: string | null;
  searchText: string | null;
  colourAnalysis: unknown;
  garmentAttributes: unknown;
  jewelleryAttributes: unknown;
  qualityScores: unknown;
  healthScore: number | null;
  healthIssues: unknown;
  indexedAt: Date | null;
  currentVersion: number;
  pipelineVersion: string;
  duplicateFingerprint: unknown;
  tags: Array<{ tag: string; source: string }>;
  override: {
    description?: string | null;
    tags?: unknown;
    colourAnalysis?: unknown;
    garmentAttributes?: unknown;
    jewelleryAttributes?: unknown;
    category?: string | null;
    subCategory?: string | null;
    qualityNotes?: string | null;
    updatedBy?: string | null;
    updatedAt?: Date;
  } | null;
  versions?: Array<{ version: number; createdAt: Date; visionModel: string | null }>;
  logs?: Array<{ event: string; message: string | null; version: number | null; createdAt: Date }>;
  embeddings?: unknown;
  featureFingerprint?: unknown;
};

function parseJson<T>(v: unknown): T | null {
  if (!v || typeof v !== "object") return null;
  return v as T;
}

function mergeTags(ai: string[], manual: string[] | null): string[] {
  const set = new Set<string>();
  for (const t of manual || []) if (t) set.add(t);
  for (const t of ai) if (t) set.add(t);
  return [...set];
}

export function toCustomerSafeProfile(row: ProfileRow): CustomerSafeProfile {
  const aiColour = parseJson<ColourAnalysis>(row.colourAnalysis);
  const aiGarment = parseJson<GarmentAttributes>(row.garmentAttributes);
  const aiJewellery = parseJson<JewelleryAttributes>(row.jewelleryAttributes);
  const aiQuality = parseJson<QualityScores>(row.qualityScores);
  const issues = (Array.isArray(row.healthIssues) ? row.healthIssues : []) as HealthIssue[];

  const override = row.override;
  const manualTags = Array.isArray(override?.tags) ? (override.tags as string[]) : null;

  const effectiveColour: ColourAnalysis | null = override?.colourAnalysis
    ? { ...(aiColour ?? {} as ColourAnalysis), ...parseJson<ColourAnalysis>(override.colourAnalysis) } as ColourAnalysis
    : aiColour;

  const effectiveGarment = override?.garmentAttributes
    ? { ...aiGarment, ...parseJson<GarmentAttributes>(override.garmentAttributes) }
    : aiGarment;

  const effectiveJewellery = override?.jewelleryAttributes
    ? { ...aiJewellery, ...parseJson<JewelleryAttributes>(override.jewelleryAttributes) }
    : aiJewellery;

  const aiTags = row.tags.filter((t) => t.source === "ai").map((t) => t.tag);
  const manualTagList = row.tags.filter((t) => t.source === "manual").map((t) => t.tag);

  return {
    itemId: row.itemId,
    status: row.status,
    description: override?.description?.trim() || row.description,
    tags: mergeTags(aiTags, manualTags || (manualTagList.length ? manualTagList : null)),
    colourAnalysis: effectiveColour,
    garmentAttributes: effectiveGarment,
    jewelleryAttributes: effectiveJewellery,
    qualityScores: aiQuality,
    healthScore: row.healthScore,
    healthIssues: issues,
    indexedAt: row.indexedAt?.toISOString() ?? null,
    hasManualOverrides: Boolean(override),
  };
}

export function toInternalProfile(row: ProfileRow): InternalProfile {
  const safe = toCustomerSafeProfile(row);
  const aiTags = row.tags.filter((t) => t.source === "ai").map((t) => t.tag);

  return {
    ...safe,
    currentVersion: row.currentVersion,
    pipelineVersion: row.pipelineVersion,
    duplicateFingerprint: parseJson(row.duplicateFingerprint),
    searchText: row.searchText,
    embeddings: row.embeddings as InternalProfile["embeddings"],
    featureFingerprint: row.featureFingerprint as Record<string, unknown> | undefined,
    versions: (row.versions || []).map((v) => ({
      version: v.version,
      createdAt: v.createdAt.toISOString(),
      visionModel: v.visionModel,
    })),
    processingHistory: (row.logs || []).map((l) => ({
      event: l.event,
      message: l.message,
      version: l.version,
      createdAt: l.createdAt.toISOString(),
    })),
    override: row.override as Record<string, unknown> | null,
    aiGenerated: {
      description: row.description,
      tags: aiTags,
      colourAnalysis: parseJson(row.colourAnalysis),
      garmentAttributes: parseJson(row.garmentAttributes),
      jewelleryAttributes: parseJson(row.jewelleryAttributes),
    },
  };
}
