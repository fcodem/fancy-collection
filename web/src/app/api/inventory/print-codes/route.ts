import { NextRequest, after } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import { collapsePrintItemsByGroup } from "@/lib/printCodesCollapse";
import { generateDefaultScanCodesInTx } from "@/lib/services/inventoryScanCode";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").map(Number).filter(Boolean) || [];
  const category = searchParams.get("category") || undefined;
  const subCategory =
    (searchParams.get("sub_category") || searchParams.get("subcategory") || "").trim() ||
    undefined;
  const q = (searchParams.get("q") || "").trim();
  const all = searchParams.get("all") === "1";

  const where: Record<string, unknown> = {};
  if (ids.length && !all) {
    where.id = { in: ids };
  }
  if (category) {
    where.category = category;
  }
  if (subCategory) {
    where.subCategory = subCategory;
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { color: { contains: q, mode: "insensitive" } },
    ];
  }

  const itemSelect = {
    id: true,
    sku: true,
    name: true,
    category: true,
    size: true,
    color: true,
    inventoryGroupId: true,
    scanCodes: {
      where: { active: true },
      orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
      select: { id: true, code: true, format: true, isPrimary: true },
    },
  };

  // Prefer filtered loads — uncapped full inventory is too slow for Print QR.
  const take =
    all && !ids.length && !category && !subCategory && !q ? 800 : all && !ids.length ? 2000 : undefined;

  const items = await prisma.clothingItem.findMany({
    where,
    select: itemSelect,
    orderBy: [{ category: "asc" }, { name: "asc" }, { size: "asc" }],
    take,
  });

  const collapsed = collapsePrintItemsByGroup(items);

  // Never block the list response on QR generation (was causing endless "Loading…").
  // Backfill a small batch in the background; user can still click Generate code.
  const missingQrIds = collapsed
    .filter((item) => !item.scanCodes.some((c) => c.format === "QR_CODE"))
    .map((item) => item.id)
    .slice(0, 40);
  if (missingQrIds.length) {
    after(async () => {
      for (const inventoryId of missingQrIds) {
        await prisma
          .$transaction((tx) => generateDefaultScanCodesInTx(tx, inventoryId))
          .catch((error) => {
            console.error(
              `[print-codes] background scan code gen failed for inventory ${inventoryId}:`,
              error,
            );
          });
      }
    });
  }

  return jsonOk({
    items: collapsed.map((item) => {
      const qr = item.scanCodes.some((code) => code.format === "QR_CODE");
      const barcode = item.scanCodes.some((code) => code.format === "CODE_128");
      return {
        ...item,
        printable: {
          qr,
          barcode,
          qrCode: qr,
          code128: barcode,
          both: qr && barcode,
        },
      };
    }),
  });
}
