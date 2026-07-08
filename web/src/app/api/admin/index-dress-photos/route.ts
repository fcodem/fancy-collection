import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import { rebuildAllFingerprints } from "@/lib/recognitionPipeline/processInventory";
import { RECOGNITION_PIPELINE_VERSION } from "@/lib/recognitionPipeline/types";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const total = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });
  const indexed = await prisma.inventoryAiProfile.count({
    where: {
      recognitionVersion: { gte: RECOGNITION_PIPELINE_VERSION },
      status: "ready",
    },
  });
  const legacyIndexed = await prisma.clothingItem.count({
    where: {
      photo: { not: null },
      NOT: { photo: "" },
      identificationIndexedAt: { not: null },
    },
  });

  return jsonOk({
    total,
    indexed: Math.max(indexed, legacyIndexed),
    pending: total - Math.max(indexed, legacyIndexed),
    engine: "recognition_pipeline_v2",
    pipelineVersion: RECOGNITION_PIPELINE_VERSION,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const result = await rebuildAllFingerprints(body.force === true);

  return jsonOk({
    processed: result.processed,
    failed: result.failed,
    message: `Rebuilt ${result.processed} AI fingerprints. ${result.failed} failed.`,
    engine: "recognition_pipeline_v2",
  });
}
