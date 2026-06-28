import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { whereDeliveryInRange } from "@/lib/bookingDateQuery";
import { serializeBookingForList } from "@/lib/booking";
import type { BookingWithItems } from "@/lib/services/bookingSearchCore";
import { parseDate } from "@/lib/constants";
import { categoryWhere, phoneWhere, words, bookingListInclude } from "@/lib/services/bookingSearchCore";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import type { Prisma } from "@prisma/client";

function textWhere(q: string): Prisma.BookingWhereInput {
  if (!q) return {};
  if (/^\d+$/.test(q)) {
    if (q.length <= 3) {
      const serial = parseInt(q, 10);
      if (!Number.isNaN(serial)) return { monthlySerial: serial };
    } else {
      return phoneWhere(q);
    }
  }
  const digits = q.replace(/\D/g, "");
  if (digits.length > 3) return phoneWhere(q);
  const ws = words(q);
  return {
    AND: ws.map((w) => ({
      OR: [
        { customerName: { contains: w, mode: "insensitive" as const } },
        { dressName: { contains: w, mode: "insensitive" as const } },
        { bookingItems: { some: { dressName: { contains: w, mode: "insensitive" as const } } } },
        { legacyItem: { is: { sku: { contains: w, mode: "insensitive" as const } } } },
        {
          bookingItems: {
            some: { item: { is: { sku: { contains: w, mode: "insensitive" as const } } } },
          },
        },
      ],
    })),
  };
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const searchDate = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const queryText = req.nextUrl.searchParams.get("q")?.trim() || "";
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";
  const refDateRaw = parseDate(searchDate);

  const dayBeforeStr = new Date(Date.UTC(refDateRaw.getUTCFullYear(), refDateRaw.getUTCMonth(), refDateRaw.getUTCDate() - 1)).toISOString().slice(0, 10);
  const dayAfterStr = new Date(Date.UTC(refDateRaw.getUTCFullYear(), refDateRaw.getUTCMonth(), refDateRaw.getUTCDate() + 1)).toISOString().slice(0, 10);

  const [exactWhere, beforeWhere, afterWhere] = await Promise.all([
    whereDeliveryInRange(searchDate, searchDate),
    whereDeliveryInRange(dayBeforeStr, dayBeforeStr),
    whereDeliveryInRange(dayAfterStr, dayAfterStr),
  ]);

  const base: Prisma.BookingWhereInput = {
    status: "booked",
    ...categoryWhere(category),
    ...textWhere(queryText),
  };

  const [exact, before, after, rest] = await Promise.all([
    prisma.booking.findMany({ where: { ...base, ...exactWhere }, include: bookingListInclude, orderBy: { deliveryTime: "asc" }, take: 100 }),
    prisma.booking.findMany({ where: { ...base, ...beforeWhere }, include: bookingListInclude, orderBy: { deliveryTime: "asc" }, take: 100 }),
    prisma.booking.findMany({ where: { ...base, ...afterWhere }, include: bookingListInclude, orderBy: { deliveryTime: "asc" }, take: 100 }),
    prisma.booking.findMany({
      where: {
        ...base,
        NOT: {
          OR: [exactWhere, beforeWhere, afterWhere],
        },
      },
      include: bookingListInclude,
      orderBy: { deliveryDate: "asc" },
      take: 80,
    }),
  ]);

  const seen = new Set<number>();
  const all: BookingWithItems[] = [];
  for (const b of [...exact, ...before, ...after, ...rest]) {
    if (!seen.has(b.id)) { seen.add(b.id); all.push(b as BookingWithItems); }
  }

  return jsonOk(all.map((b) => serializeBookingForList(b as Parameters<typeof serializeBookingForList>[0])));
}
