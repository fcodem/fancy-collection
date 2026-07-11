import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { serializeBookingForList } from "@/lib/booking";
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

  const queryText = req.nextUrl.searchParams.get("q")?.trim() || "";
  const category = req.nextUrl.searchParams.get("category")?.trim() || "";

  const where: Prisma.BookingWhereInput = {
    status: "booked",
    ...categoryWhere(category),
    ...textWhere(queryText),
  };

  const bookings = await prisma.booking.findMany({
    where,
    include: bookingListInclude,
    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }, { monthlySerial: "asc" }],
  });

  return jsonOk(
    bookings.map((b) =>
      serializeBookingForList(b as Parameters<typeof serializeBookingForList>[0]),
    ),
  );
}
