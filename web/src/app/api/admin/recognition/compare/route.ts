import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import { parseFeatureFingerprint } from "@/lib/recognitionPipeline/buildFingerprint";
import { computeHybridSimilarity } from "@/lib/recognitionPipeline/hybridSimilarity";
import { parseIdentificationIndex } from "@/lib/dressIdentificationIndex";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json()) as { itemA: number; itemB: number };
  if (!body.itemA || !body.itemB) return jsonError("itemA and itemB required", 400);

  const items = await prisma.clothingItem.findMany({
    where: { id: { in: [body.itemA, body.itemB] } },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      color: true,
      recognitionFingerprint: true,
      identificationIndex: true,
      aiProfile: { select: { recognitionFingerprint: true } },
    },
  });

  const a = items.find((i) => i.id === body.itemA);
  const b = items.find((i) => i.id === body.itemB);
  if (!a || !b) return jsonError("Items not found", 404);

  const fpA =
    parseFeatureFingerprint(a.aiProfile?.recognitionFingerprint) ||
    parseFeatureFingerprint(a.recognitionFingerprint);
  const fpB =
    parseFeatureFingerprint(b.aiProfile?.recognitionFingerprint) ||
    parseFeatureFingerprint(b.recognitionFingerprint);

  if (!fpA || !fpB) {
    return jsonError("One or both items lack AI fingerprints. Run Rebuild AI Fingerprints first.", 400);
  }

  const embA = parseIdentificationIndex(a.identificationIndex)?.references[0]?.embeddings ?? null;
  const embB = parseIdentificationIndex(b.identificationIndex)?.references[0]?.embeddings ?? null;

  const comparison = computeHybridSimilarity(fpA, fpB, embA, embB, b.color);

  return jsonOk({
    itemA: { id: a.id, sku: a.sku, name: a.name },
    itemB: { id: b.id, sku: b.sku, name: b.name },
    hybridScore: comparison.hybrid,
    breakdown: comparison,
  });
}
