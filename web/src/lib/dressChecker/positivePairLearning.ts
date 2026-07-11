/**
 * Continuous learning from admin confirm / reject.
 * Positive pairs boost rerank; negative pairs demote lookalikes.
 */

import prisma from "../prisma";
import { learnFromPositiveCorrection } from "../dressCheckerCorrections";

export type SameDressConfirmInput = {
  itemId: number;
  queryPhotoRelPath: string;
  catalogPhotoRelPath?: string | null;
  queryType?: string | null;
  confidence?: number | null;
  matchedIdentifiers?: string[];
  confirmedBy?: string | null;
  searchId?: string | null;
  source?: string;
};

export type NegativePairInput = {
  rejectedItemId: number;
  queryItemId?: number | null;
  queryPhotoRelPath?: string | null;
  reason?: string | null;
  confirmedBy?: string | null;
  searchId?: string | null;
  source?: string;
};

export type AdminFeedbackInput = {
  itemId?: number | null;
  searchId?: string | null;
  feedback: "correct" | "reject" | "same_collection" | string;
  notes?: string | null;
  queryPhoto?: string | null;
  createdBy?: string | null;
};

/**
 * Persist a confirmed same-dress pair and reindex the query photo as a reference view.
 */
export async function confirmSameDressPair(input: SameDressConfirmInput): Promise<{
  pairId: number;
  referenceAdded: boolean;
}> {
  const pair = await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO dress_checker_positive_pairs
      (item_id, query_photo, catalog_photo, query_type, confidence, matched_identifiers, source, confirmed_by, search_id)
    VALUES (
      ${input.itemId},
      ${input.queryPhotoRelPath},
      ${input.catalogPhotoRelPath ?? null},
      ${input.queryType ?? null},
      ${input.confidence ?? null},
      ${input.matchedIdentifiers ? JSON.stringify(input.matchedIdentifiers) : null}::jsonb,
      ${input.source ?? "admin_confirm"},
      ${input.confirmedBy ?? null},
      ${input.searchId ?? null}
    )
    RETURNING id
  `;

  const pairId = pair[0]?.id ?? 0;

  await prisma.$executeRaw`
    INSERT INTO dress_admin_feedback (item_id, search_id, feedback, notes, query_photo, created_by)
    VALUES (
      ${input.itemId},
      ${input.searchId ?? null},
      ${"correct"},
      ${"same_dress_confirmed"},
      ${input.queryPhotoRelPath},
      ${input.confirmedBy ?? null}
    )
  `;

  await learnFromPositiveCorrection(input.itemId, input.queryPhotoRelPath);

  return { pairId, referenceAdded: true };
}

/** Store admin rejection of a near-duplicate / false positive. */
export async function recordNegativePair(input: NegativePairInput): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO dress_negative_pairs
      (query_item_id, rejected_item_id, query_photo, reason, source, confirmed_by, search_id)
    VALUES (
      ${input.queryItemId ?? null},
      ${input.rejectedItemId},
      ${input.queryPhotoRelPath ?? null},
      ${input.reason ?? null},
      ${input.source ?? "admin_reject"},
      ${input.confirmedBy ?? null},
      ${input.searchId ?? null}
    )
    RETURNING id
  `;

  await prisma.$executeRaw`
    INSERT INTO dress_admin_feedback (item_id, search_id, feedback, notes, query_photo, created_by)
    VALUES (
      ${input.rejectedItemId},
      ${input.searchId ?? null},
      ${"reject"},
      ${input.reason ?? "admin_rejected"},
      ${input.queryPhotoRelPath ?? null},
      ${input.confirmedBy ?? null}
    )
  `;

  return rows[0]?.id ?? 0;
}

export async function recordAdminFeedback(input: AdminFeedbackInput): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO dress_admin_feedback (item_id, search_id, feedback, notes, query_photo, created_by)
    VALUES (
      ${input.itemId ?? null},
      ${input.searchId ?? null},
      ${input.feedback},
      ${input.notes ?? null},
      ${input.queryPhoto ?? null},
      ${input.createdBy ?? null}
    )
  `;
}

/** Soft boost for items with confirmed cross-view pairs (0–5). */
export async function positivePairBoostForItem(itemId: number): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM dress_checker_positive_pairs WHERE item_id = ${itemId}
    `;
    return Math.min(5, Number(rows[0]?.c ?? 0));
  } catch {
    return 0;
  }
}

/** Soft demotion for frequently rejected lookalikes (0–8). */
export async function negativePairPenaltyForItem(itemId: number): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM dress_negative_pairs WHERE rejected_item_id = ${itemId}
    `;
    return Math.min(8, Number(rows[0]?.c ?? 0) * 2);
  } catch {
    return 0;
  }
}

/** Batch learning adjustments for rerank shortlist. */
export async function learningAdjustmentsForItems(
  itemIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!itemIds.length) return map;
  await Promise.all(
    itemIds.map(async (id) => {
      const [boost, penalty] = await Promise.all([
        positivePairBoostForItem(id),
        negativePairPenaltyForItem(id),
      ]);
      map.set(id, boost - penalty);
    }),
  );
  return map;
}
