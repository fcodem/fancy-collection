import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { backfillInventoryThumbnails } from "@/lib/services/inventoryThumbnailBackfill";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CURSOR_KEY = "inventory_thumb_backfill_cursor";

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return jsonError("Unauthorized", 401);
  try {
    const row = await prisma.aiRuntimeSetting.findUnique({ where: { key: CURSOR_KEY } });
    const afterId = Number(row?.value) || 0;
    const result = await backfillInventoryThumbnails({ afterId, batchSize: 15, budgetMs: 40_000 });
    // Past the last id: wrap so rows whose photo was unreachable get retried later.
    const nextCursor = result.scanned === 0 ? 0 : result.lastId;
    if (result.remaining > 0 || afterId !== 0) {
      await prisma.aiRuntimeSetting.upsert({
        where: { key: CURSOR_KEY },
        create: { key: CURSOR_KEY, value: String(nextCursor), updatedBy: "cron" },
        update: { value: String(nextCursor), updatedBy: "cron" },
      });
    }
    return jsonOk({ ok: true, ...result, nextCursor });
  } catch (e) {
    console.error("[cron/inventory-thumbnails]", e instanceof Error ? e.message : e);
    return jsonError("Thumbnail backfill failed", 500);
  }
}
