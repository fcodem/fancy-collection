import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";
import { sendBookingBillWhatsApp } from "@/lib/services/whatsapp/automatedMessages";
import { processWhatsAppJobQueue } from "@/lib/services/whatsapp/jobQueue";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const { searchParams } = req.nextUrl;
  const bookingId = searchParams.get("bookingId");
  const action = searchParams.get("action") || "queue";

  if (!bookingId) {
    return jsonError("Pass ?bookingId=X and ?action=direct|queue|process", 400);
  }

  const id = parseInt(bookingId, 10);

  try {
    if (action === "direct") {
      const result = await sendBookingBillWhatsApp(id, req.nextUrl.origin);
      return jsonOk({ action: "direct", result });
    }

    if (action === "process") {
      const result = await processWhatsAppJobQueue();
      return jsonOk({ action: "process", result });
    }

    const jobs = await prisma.whatsAppJob.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return jsonOk({ action: "status", jobs });
  } catch (e) {
    console.error("[debug/whatsapp-test]", e);
    return jsonError(e instanceof Error ? e.message : "Test failed", 500);
  }
}
