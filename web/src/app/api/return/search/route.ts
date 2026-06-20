import { NextRequest } from "next/server";
import prisma, { parseDateQ } from "@/lib/prisma";
import { serializeBookingForList } from "@/lib/booking";
import type { BookingWithItems } from "@/lib/services/bookingSearchCore";
import { parseDate } from "@/lib/constants";
import { categoryWhere } from "@/lib/services/bookingSearchCore";
import { jsonOk, requireUser, isResponse } from "@/lib/api";
import type { Prisma } from "@prisma/client";

const bookingInclude = {
  bookingItems: { include: { item: true } },
  legacyItem: true,
} as const;

function textWhere(q: string): Prisma.BookingWhereInput {
  if (!q) return {};
  const digits = q.replace(/\D/g, "");
  if (/^\d+$/.test(q) && q.length <= 4) {
    return { monthlySerial: parseInt(q, 10) };
  }
  if (digits.length >= 7) {
    return { OR: [{ contact1: { contains: digits } }, { whatsappNo: { contains: digits } }] };
  }
  const ws = q.trim().split(/\s+/).filter(Boolean);
  return {
    AND: ws.map((w) => ({
      OR: [
        { customerName: { contains: w } },
        { dressName: { contains: w } },
        { bookingItems: { some: { dressName: { contains: w } } } },
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
  const refDate = parseDateQ(searchDate);

  const dayBefore = parseDateQ(new Date(Date.UTC(refDateRaw.getUTCFullYear(), refDateRaw.getUTCMonth(), refDateRaw.getUTCDate() - 1)).toISOString().slice(0, 10));
  const dayAfter  = parseDateQ(new Date(Date.UTC(refDateRaw.getUTCFullYear(), refDateRaw.getUTCMonth(), refDateRaw.getUTCDate() + 1)).toISOString().slice(0, 10));

  const base: Prisma.BookingWhereInput = {
    status: { in: ["delivered", "booked"] },
    OR: [
      { status: "delivered" },
      { bookingItems: { some: { isDelivered: true } } },
    ],
    ...categoryWhere(category),
    ...textWhere(queryText),
  };

  const [exact, before, after, rest] = await Promise.all([
    prisma.booking.findMany({ where: { ...base, returnDate: refDate }, include: bookingInclude, orderBy: { returnTime: "asc" } }),
    prisma.booking.findMany({ where: { ...base, returnDate: dayBefore }, include: bookingInclude, orderBy: { returnTime: "asc" } }),
    prisma.booking.findMany({ where: { ...base, returnDate: dayAfter }, include: bookingInclude, orderBy: { returnTime: "asc" } }),
    prisma.booking.findMany({
      where: {
        ...base,
        NOT: {
          OR: [
            { returnDate: refDate },
            { returnDate: dayBefore },
            { returnDate: dayAfter },
          ],
        },
      },
      include: bookingInclude,
      orderBy: { returnDate: "asc" },
      take: 80,
    }),
  ]);

  const seen = new Set<number>();
  const all: BookingWithItems[] = [];
  for (const b of [...exact, ...before, ...after, ...rest]) {
    if (!seen.has(b.id)) { seen.add(b.id); all.push(b as BookingWithItems); }
  }

  return jsonOk(all.map((b) => serializeBookingForList(b)));
}
