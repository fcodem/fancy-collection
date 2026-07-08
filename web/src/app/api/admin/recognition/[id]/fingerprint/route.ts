import prisma from "@/lib/prisma";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { parseFeatureFingerprint } from "@/lib/recognitionPipeline/buildFingerprint";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const itemId = parseInt((await params).id, 10);
  if (!itemId) return jsonError("Invalid item id", 400);

  const profile = await prisma.inventoryAiProfile.findUnique({
    where: { itemId },
    include: {
      item: { select: { sku: true, name: true, category: true, photo: true } },
      logs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!profile) {
    return jsonOk({ itemId, status: "none", fingerprint: null });
  }

  const fingerprint = parseFeatureFingerprint(profile.recognitionFingerprint);

  return jsonOk({
    itemId,
    sku: profile.item.sku,
    name: profile.item.name,
    category: profile.item.category,
    status: profile.status,
    pipelineVersion: profile.pipelineVersion,
    modelVersion: profile.modelVersion,
    recognitionVersion: profile.recognitionVersion,
    qualityScore: profile.qualityScore,
    lastProcessed: profile.lastProcessed,
    recognitionImage: profile.recognitionImage,
    fingerprint,
    colourAnalysis: profile.colourAnalysis,
    garmentAttributes: profile.garmentAttributes,
    logs: profile.logs,
  });
}
