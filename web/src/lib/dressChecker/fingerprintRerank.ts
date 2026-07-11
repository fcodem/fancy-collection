/**
 * Stage 2 real fingerprint reranking — soft scores from permanent inventory fingerprints.
 * Not an unsafe hard gate unless both sides are high-confidence and complete.
 */
import prisma from "@/lib/prisma";

export type FingerprintQueryHints = {
  primaryColour?: string | null;
  colourFamily?: string | null;
  motifs?: string[];
  embroideryDensity?: string | null;
  embroideryStyle?: string | null;
  borderType?: string | null;
  panelSequence?: string[];
  uniqueIdentifiers?: string[];
  silhouette?: string | null;
  /** Soft mode for partial / low-light queries */
  softMode?: boolean;
};

export type FingerprintScoreRow = {
  itemId: number;
  score: number; // 0–100
  delta: number; // applied to seed (−12…+15)
  reasons: string[];
  complete: boolean;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).toLowerCase()).filter(Boolean);
}

function overlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let hits = 0;
  for (const x of a) {
    if (b.some((y) => y.includes(x) || x.includes(y))) hits += 1;
  }
  return Math.min(1, hits / Math.max(a.length, 1));
}

/**
 * Score ANN candidates against stored permanent fingerprints + learning adjustments.
 */
export async function scoreFingerprintShortlist(
  itemIds: number[],
  query: FingerprintQueryHints,
  learningDelta?: Map<number, number>,
): Promise<Map<number, FingerprintScoreRow>> {
  const out = new Map<number, FingerprintScoreRow>();
  if (!itemIds.length) return out;

  const ids = itemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      item_id: number;
      primary_color: string | null;
      color_families: unknown;
      motifs: unknown;
      embroidery_density: string | null;
      embroidery_style: string | null;
      border_type: string | null;
      panel_sequence: unknown;
      unique_identifiers: unknown;
      silhouette: string | null;
      confidence: number | null;
      validation_status: string | null;
    }>
  >(
    `SELECT DISTINCT ON (item_id)
       item_id, primary_color, color_families, motifs, embroidery_density, embroidery_style,
       border_type, panel_sequence, unique_identifiers, silhouette, confidence, validation_status
     FROM inventory_ai_fingerprints
     WHERE item_id = ANY($1::int[])
       AND COALESCE(validation_status, 'VALID') = 'VALID'
     ORDER BY item_id, updated_at DESC NULLS LAST`,
    ids,
  );

  const qMotifs = (query.motifs ?? []).map((m) => m.toLowerCase());
  const qIds = (query.uniqueIdentifiers ?? []).map((m) => m.toLowerCase());
  const qPanels = (query.panelSequence ?? []).map((m) => m.toLowerCase());
  const qColour = (query.primaryColour || query.colourFamily || "").toLowerCase();
  const soft = !!query.softMode;

  for (const id of ids) {
    out.set(id, {
      itemId: id,
      score: 50,
      delta: learningDelta?.get(id) ?? 0,
      reasons: learningDelta?.get(id) ? [`learnΔ=${learningDelta.get(id)}`] : [],
      complete: false,
    });
  }

  for (const row of rows) {
    const reasons: string[] = [];
    let score = 40;
    const motifs = asStringArray(row.motifs);
    const families = asStringArray(row.color_families);
    const panels = asStringArray(row.panel_sequence);
    const uids = asStringArray(row.unique_identifiers);
    const complete =
      Boolean(row.primary_color || families.length) &&
      (motifs.length > 0 || Boolean(row.border_type)) &&
      (row.confidence ?? 0) >= 40;

    const motifOv = overlapScore(qMotifs, motifs);
    score += Math.round(motifOv * 22);
    if (motifOv > 0) reasons.push(`motif=${(motifOv * 100).toFixed(0)}`);

    if (qColour) {
      const pc = (row.primary_color || "").toLowerCase();
      if (pc.includes(qColour) || qColour.includes(pc) || families.some((f) => f.includes(qColour) || qColour.includes(f))) {
        score += 12;
        reasons.push("colour+");
      } else if (families.length && !soft) {
        score -= 8;
        reasons.push("colour-");
      }
    }

    if (query.borderType && row.border_type) {
      const qb = query.borderType.toLowerCase();
      const rb = row.border_type.toLowerCase();
      if (rb.includes(qb.slice(0, 6)) || qb.includes(rb.slice(0, 6))) {
        score += 10;
        reasons.push("border+");
      }
    }

    const panelOv = overlapScore(qPanels, panels);
    score += Math.round(panelOv * 12);
    if (panelOv > 0) reasons.push(`panel=${(panelOv * 100).toFixed(0)}`);

    const idOv = overlapScore(qIds, uids);
    score += Math.round(idOv * 16);
    if (idOv > 0) reasons.push(`uid=${(idOv * 100).toFixed(0)}`);

    if (query.embroideryDensity && row.embroidery_density) {
      if (query.embroideryDensity.toLowerCase() === row.embroidery_density.toLowerCase()) {
        score += 6;
        reasons.push("embDensity+");
      }
    }

    if (query.silhouette && row.silhouette) {
      if (query.silhouette.toLowerCase() === row.silhouette.toLowerCase()) {
        score += 4;
        reasons.push("sil+");
      }
    }

    score = Math.max(0, Math.min(100, score));
    const learn = learningDelta?.get(row.item_id) ?? 0;
    // Map fingerprint score to seed delta: center at 50 → 0
    let delta = Math.round((score - 50) / 5); // −10…+10
    if (soft) delta = Math.round(delta * 0.6);
    // High-confidence complete fingerprints may apply slightly stronger soft boost
    if (complete && !soft && score >= 75) delta = Math.min(15, delta + 2);
    if (complete && !soft && score <= 25) delta = Math.max(-12, delta - 2);
    delta += learn;

    out.set(row.item_id, {
      itemId: row.item_id,
      score,
      delta: Math.max(-12, Math.min(15, delta)),
      reasons: [...reasons, ...(learn ? [`learnΔ=${learn}`] : [])],
      complete,
    });
  }

  return out;
}
