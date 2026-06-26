import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { dressDisplayName } from "@/lib/dress";
import { parseDate } from "@/lib/constants";
import {
  customerNameWhere,
  dressNameWhere,
  phoneWhere,
} from "@/lib/services/bookingSearchCore";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

const listInclude = {
  bookingItems: {
    select: {
      dressName: true,
      category: true,
      size: true,
      item: { select: { size: true } },
    },
  },
  legacyItem: { select: { size: true } },
} as const;

type SuggestBooking = {
  id: number;
  monthlySerial: number;
  customerName: string;
  dressName: string | null;
  deliveryDate: Date;
  returnDate: Date;
  contact1: string;
  whatsappNo: string | null;
  bookingItems: Array<{
    dressName: string;
    category: string | null;
    size: string | null;
    item: { size: string | null } | null;
  }>;
};

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const date = req.nextUrl.searchParams.get("date") || "";
  const mode = req.nextUrl.searchParams.get("mode") || "delivery";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "12", 10), 20);

  if (!q || q.length < 1) return jsonOk([]);

  const statusFilter =
    mode === "postponed"
      ? ("postponed" as const)
      : mode === "return"
        ? { in: ["delivered" as const, "booked" as const] }
        : { in: ["booked" as const] };

  const statusWhere =
    mode === "postponed" ? { status: statusFilter } : { status: statusFilter };

  let bookings: SuggestBooking[] = [];

  if (/^\d+$/.test(q)) {
    const serial = parseInt(q, 10);
    if (!Number.isNaN(serial)) {
      bookings = await prisma.booking.findMany({
        where: { ...statusWhere, monthlySerial: serial },
        include: listInclude,
        take: limit,
      });
    }
    if (!bookings.length && q.length > 3) {
      bookings = await prisma.booking.findMany({
        where: { ...statusWhere, ...phoneWhere(q) },
        include: listInclude,
        orderBy: [{ deliveryDate: "desc" }],
        take: limit,
      });
    }
    if (!bookings.length) {
      const pool = await prisma.booking.findMany({
        where: statusWhere,
        include: listInclude,
        orderBy: [{ monthlySerial: "desc" }],
        take: 400,
      });
      bookings = pool
        .filter((b) =>
          String(b.monthlySerial).padStart(2, "0").startsWith(q) ||
          String(b.monthlySerial).startsWith(q),
        )
        .slice(0, limit);
    }
  } else if (q.replace(/\D/g, "").length >= 7) {
    bookings = await prisma.booking.findMany({
      where: { ...statusWhere, ...phoneWhere(q) },
      include: listInclude,
      orderBy: [{ deliveryDate: "desc" }],
      take: limit,
    });
  } else {
    const customerRows = await prisma.booking.findMany({
      where: { ...statusWhere, ...customerNameWhere(q) },
      include: listInclude,
      orderBy: [{ deliveryDate: "desc" }],
      take: limit,
    });
    bookings = customerRows.length
      ? customerRows
      : await prisma.booking.findMany({
          where: { ...statusWhere, ...dressNameWhere(q) },
          include: listInclude,
          orderBy: [{ deliveryDate: "desc" }],
          take: limit,
        });
  }

  if (date && bookings.length) {
    const ref = parseDate(date);
    const refMs = ref.getTime();
    bookings = [...bookings].sort((a, b) => {
      const aDate = mode === "return" ? a.returnDate : a.deliveryDate;
      const bDate = mode === "return" ? b.returnDate : b.deliveryDate;
      return Math.abs(aDate.getTime() - refMs) - Math.abs(bDate.getTime() - refMs);
    });
  }

  return jsonOk(bookings.slice(0, limit).map(formatSuggestRow));
}

function formatSuggestRow(b: SuggestBooking) {
  const dresses = b.bookingItems.length
    ? b.bookingItems.map((bi) => dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size)).join(", ")
    : b.dressName || "";
  return {
    id: b.id,
    serial: b.monthlySerial,
    label: `#${String(b.monthlySerial).padStart(2, "0")} — ${b.customerName}`,
    meta: dresses,
    customer_name: b.customerName,
  };
}
