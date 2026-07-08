/**
 * Applies Claude Vision identity verification on top of local recall.
 * Local embeddings shortlist candidates; the VLM decides the actual same-dress match
 * and drives the final confidence used by the decision + UI layers.
 */
import prisma from "../prisma";
import { loadPhotoBuffer } from "../services/siglipSearch";
import type { RankedCandidate } from "./types";
import {
  isVlmAvailable,
  verifyDressIdentity,
  type VlmCandidate,
  type VlmVerdict,
} from "./vlmIdentity";

const VLM_SHORTLIST = 8;
const MAX_REFS_PER_CANDIDATE = 2;
/** Non-matched candidates are capped below the "possible" threshold so they never auto-identify. */
const NON_MATCH_CAP = 60;
const UNSEEN_CAP = 55;

export type VlmVerificationOutcome = {
  reranked: RankedCandidate[];
  verdict: VlmVerdict | null;
  usedVlm: boolean;
};

async function loadCandidateImages(c: RankedCandidate): Promise<Buffer[]> {
  const images: Buffer[] = [];
  const primaryPhoto = c.photo || c.recognitionImage;
  if (primaryPhoto) {
    const buf = await loadPhotoBuffer(primaryPhoto);
    if (buf) images.push(buf);
  }

  const refs = await prisma.clothingItemReferencePhoto.findMany({
    where: { itemId: c.itemId },
    orderBy: { sortOrder: "asc" },
    take: MAX_REFS_PER_CANDIDATE,
    select: { photo: true },
  });
  for (const r of refs) {
    const buf = await loadPhotoBuffer(r.photo);
    if (buf) images.push(buf);
  }
  return images;
}

function withFinal(candidate: RankedCandidate, finalScore: number, note?: string): RankedCandidate {
  const clamped = Math.max(0, Math.min(100, Math.round(finalScore)));
  const summary = note && note.trim().length > 0 ? note.trim() : candidate.explanation.summary;
  return {
    ...candidate,
    identity: { ...candidate.identity, final: clamped },
    rankReason: summary,
    explanation: { ...candidate.explanation, summary, overall: clamped },
  };
}

export async function applyVlmVerification(
  queryImage: Buffer,
  reranked: RankedCandidate[],
): Promise<VlmVerificationOutcome> {
  if (!isVlmAvailable() || reranked.length === 0) {
    return { reranked, verdict: null, usedVlm: false };
  }

  const shortlist = reranked.slice(0, VLM_SHORTLIST);
  const vlmCandidates: VlmCandidate[] = [];
  for (const c of shortlist) {
    const images = await loadCandidateImages(c);
    if (images.length === 0) continue;
    vlmCandidates.push({ itemId: c.itemId, sku: c.sku, name: c.name, images });
  }

  if (vlmCandidates.length === 0) {
    return { reranked, verdict: null, usedVlm: false };
  }

  const verdict = await verifyDressIdentity(queryImage, vlmCandidates);
  if (!verdict.usedVlm) {
    return { reranked, verdict, usedVlm: false };
  }

  const perCandidate = new Map(verdict.perCandidate.map((p) => [p.itemId, p]));
  const evaluated = new Set(vlmCandidates.map((c) => c.itemId));

  const rescored = reranked.map((c) => {
    if (!evaluated.has(c.itemId)) {
      // Not shown to the VLM — cannot be trusted as an identity match.
      return withFinal(c, Math.min(c.identity.final, UNSEEN_CAP));
    }
    const row = perCandidate.get(c.itemId);
    if (!row) {
      return withFinal(c, Math.min(c.identity.final, NON_MATCH_CAP));
    }
    if (row.sameDress) {
      const score = c.itemId === verdict.matchItemId ? Math.max(row.confidence, verdict.confidence) : row.confidence;
      return withFinal(c, score, row.notes);
    }
    return withFinal(c, Math.min(row.confidence, NON_MATCH_CAP), row.notes);
  });

  rescored.sort((a, b) => b.identity.final - a.identity.final);

  return { reranked: rescored, verdict, usedVlm: true };
}
