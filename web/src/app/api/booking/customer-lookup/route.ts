import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { jsonOk, jsonError, requireOwner, isResponse } from "@/lib/api";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  if (!q) {
    const bookings = await prisma.booking.findMany({
      select: {
        customerName: true,
        customerAddress: true,
        contact1: true,
        whatsappNo: true,
        venue: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const seen = new Map<string, typeof bookings[0]>();
    for (const b of bookings) {
      const key = b.contact1.replace(/\D/g, "").slice(-10) || b.contact1.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, b);
    }

    const customers = [...seen.values()].slice(0, 20).map((b) => ({
      customer_name: b.customerName,
      customer_address: b.customerAddress,
      contact_1: b.contact1,
      whatsapp_no: b.whatsappNo || "",
      venue: b.venue || "",
    }));

    return jsonOk({ customers });
  }

  if (q.length < 2) return jsonOk({ customers: [] });

  const isDigits = /^\d+$/.test(q);
  const where: Prisma.BookingWhereInput = isDigits
    ? {
        OR: [
          { contact1: { contains: q, mode: "insensitive" } },
          { whatsappNo: { contains: q, mode: "insensitive" } },
        ],
      }
    : {
        AND: q.split(/\s+/).filter(Boolean).map((w) => ({
          customerName: { contains: w, mode: "insensitive" as const },
        })),
      };

  const bookings = await prisma.booking.findMany({
    where,
    select: {
      customerName: true,
      customerAddress: true,
      contact1: true,
      whatsappNo: true,
      venue: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const seen = new Map<string, typeof bookings[0]>();
  for (const b of bookings) {
    const key = b.contact1.replace(/\D/g, "").slice(-10);
    if (!seen.has(key)) seen.set(key, b);
  }

  const customers = [...seen.values()].slice(0, 20).map((b) => ({
    customer_name: b.customerName,
    customer_address: b.customerAddress,
    contact_1: b.contact1,
    whatsapp_no: b.whatsappNo || "",
    venue: b.venue || "",
  }));

  return jsonOk({ customers });
}
