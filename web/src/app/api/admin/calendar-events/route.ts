import { activeBookingWhere } from "@/lib/bookingActiveStatus";

import prisma from "@/lib/prisma";

import { jsonOk, requireUser, isResponse } from "@/lib/api";

import { formatInr } from "@/lib/format";

import { resolveBookingStatus } from "@/lib/bookingStatus";



export const dynamic = "force-dynamic";



type DayBookingSummary = {

  id: number;

  serial: number;

  customer: string;

  phone: string;

  whatsapp: string;

  status: string;

  deliveryTime: string;

  dressCount: number;

};



export async function GET() {

  const user = await requireUser();

  if (isResponse(user)) return user;



  const now = new Date();

  const rangeStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));

  const rangeEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth() + 6, 0));



  const bookings = await prisma.booking.findMany({

    where: {

      ...activeBookingWhere(),

      deliveryDate: { gte: rangeStart, lte: rangeEnd },

    },

    include: {

      bookingItems: { select: { id: true } },

    },

    orderBy: [{ deliveryDate: "asc" }, { deliveryTime: "asc" }],

  });



  const byDate = new Map<string, typeof bookings>();

  for (const b of bookings) {

    const key = b.deliveryDate.toISOString().slice(0, 10);

    if (!byDate.has(key)) byDate.set(key, []);

    byDate.get(key)!.push(b);

  }



  const events = [...byDate.entries()].map(([date, list]) => {

    const count = list.length;

    const dayBookings: DayBookingSummary[] = list.map((b) => ({

      id: b.id,

      serial: b.monthlySerial,

      customer: b.customerName,

      phone: b.contact1,

      whatsapp: b.whatsappNo || "",

      status: resolveBookingStatus(b),

      deliveryTime: b.deliveryTime,

      dressCount: b.bookingItems.length || (b.dressName ? 1 : 0),

    }));



    return {

      id: date,

      title: `${count} ${count === 1 ? "Booking" : "Bookings"}`,

      start: date,

      count,

      bookings: dayBookings,

      totalAdvance: list.reduce((s, b) => s + (b.totalAdvance || b.advance || 0), 0),

      totalPrice: list.reduce((s, b) => s + (b.totalPrice || b.price || 0), 0),

      advanceDisplay: `₹${formatInr(list.reduce((s, b) => s + (b.totalAdvance || b.advance || 0), 0))}`,

      priceDisplay: `₹${formatInr(list.reduce((s, b) => s + (b.totalPrice || b.price || 0), 0))}`,

    };

  });



  return jsonOk(events);

}

