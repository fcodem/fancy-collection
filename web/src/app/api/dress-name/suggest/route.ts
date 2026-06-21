import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { buildDressSearchWhere, dressDisplayName } from "@/lib/dress";
import { jsonOk } from "@/lib/api";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "12", 10), 30);

  if (!q) return jsonOk([]);

  const where = buildDressSearchWhere(q);
  const items = await prisma.clothingItem.findMany({
    where: {
      ...where,
      ...(category ? { category } : {}),
    },
    take: limit,
    orderBy: [{ name: "asc" }, { size: "asc" }],
  });

  return jsonOk(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      display_name: dressDisplayName(i.name, i.category, i.size),
      sku: i.sku,
      category: i.category,
      size: i.size || "",
      color: i.color || "",
      photo: i.photo || "",
    })),
  );
}
