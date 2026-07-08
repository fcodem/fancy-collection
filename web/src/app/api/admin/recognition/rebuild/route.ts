import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";
import {
  rebuildAllAiProfiles,
  rebuildSelectedAiProfiles,
} from "@/lib/dressChecker/processInventory";
import { DRESS_CHECKER_FINGERPRINT_VERSION } from "@/lib/dressChecker/types";
import { DRESS_CHECKER_ENGINE_VERSION } from "@/lib/dressChecker/constants";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const total = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });
  const indexed = await prisma.inventoryAiProfile.count({
    where: {
      recognitionVersion: { gte: DRESS_CHECKER_FINGERPRINT_VERSION },
      status: "ready",
    },
  });

  return jsonOk({
    total,
    indexed,
    pending: total - indexed,
    pipelineVersion: DRESS_CHECKER_ENGINE_VERSION,
    engine: "dress_checker_v5",
  });
}

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean;
    itemIds?: number[];
  };

  if (body.itemIds?.length) {
    const result = await rebuildSelectedAiProfiles(body.itemIds);
    return jsonOk({
      ...result,
      message: `Rebuilt ${result.processed} items. ${result.failed} failed.`,
    });
  }

  const result = await rebuildAllAiProfiles(body.force === true);
  return jsonOk({
    ...result,
    message: `Rebuilt ${result.processed} AI fingerprints. ${result.failed} failed.`,
  });
}
