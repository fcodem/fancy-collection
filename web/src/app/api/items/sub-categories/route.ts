import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, requireUserReadOnly, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUserReadOnly();
  if (isResponse(user)) return user;

  const category = req.nextUrl.searchParams.get("category") || "";
  if (!category) return jsonOk({ subCategories: [] });

  const rows = await prisma.clothingItem.findMany({
    where: { category, subCategory: { not: null } },
    select: { subCategory: true },
    distinct: ["subCategory"],
    orderBy: { subCategory: "asc" },
  });

  const subCategories = rows
    .map((r) => r.subCategory)
    .filter((s): s is string => Boolean(s?.trim()));

  return jsonOk({ subCategories });
}
