import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { buildDressSearchWhere, dressDisplayName } from "@/lib/dress";
import { checkItemAvailabilityForDates } from "@/lib/booking";
import { parseDate } from "@/lib/constants";
import { jsonError, jsonOk, requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const deliveryDateStr = req.nextUrl.searchParams.get("delivery_date") || "";
  const returnDateStr = req.nextUrl.searchParams.get("return_date") || "";
  const dressName = req.nextUrl.searchParams.get("dress_name")?.trim() || "";
  const categoryFilter = req.nextUrl.searchParams.get("category")?.trim() || "";

  if (!deliveryDateStr || !returnDateStr) return jsonError("Delivery and return dates are required.");
  if (!dressName) return jsonError("Dress name is required.");

  const dDate = parseDate(deliveryDateStr);
  const rDate = parseDate(returnDateStr);
  if (rDate < dDate) return jsonError("Return date cannot be before delivery date.");

  const where = buildDressSearchWhere(dressName);
  const items = await prisma.clothingItem.findMany({
    where: {
      ...where,
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
    orderBy: [{ name: "asc" }, { size: "asc" }],
  });

  if (!items.length) {
    return jsonOk({
      items: [],
      message: `No dress found matching '${dressName}'${categoryFilter ? ` in ${categoryFilter}` : ""}`,
      delivery_date: deliveryDateStr,
      return_date: returnDateStr,
    });
  }

  const results = await Promise.all(
    items.map(async (item) => {
      const avail = await checkItemAvailabilityForDates(item, dDate, rDate);
      return {
        id: item.id,
        name: item.name,
        display_name: dressDisplayName(item.name, item.category, item.size),
        sku: item.sku,
        category: item.category,
        size: item.size || "",
        color: item.color || "",
        photo: item.photo || "",
        inventory_status: item.status,
        ...avail,
      };
    })
  );

  return jsonOk({
    items: results,
    message: `Found ${results.length} matching dress(es)`,
    delivery_date: deliveryDateStr,
    return_date: returnDateStr,
    dress_name: dressName,
    category: categoryFilter || "All",
  });
}
