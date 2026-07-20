import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").map(Number).filter(Boolean) || [];
  const category = searchParams.get("category") || undefined;
  const all = searchParams.get("all") === "1";

  const where: Record<string, unknown> = {};
  if (ids.length && !all) {
    where.id = { in: ids };
  }
  if (category) {
    where.category = category;
  }

  const items = await prisma.clothingItem.findMany({
    where,
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      size: true,
      color: true,
      scanCodes: {
        where: { active: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { id: true, code: true, format: true, isPrimary: true },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return jsonOk({
    items: items.map((item) => {
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
