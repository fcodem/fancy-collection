import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  deliverySlipHref,
  isDeliverySlipEligible,
  isReturnSlipEligible,
  returnSlipHref,
} from "@/lib/bookingStatus";
import CustomerSlipsClient, {
  type CustomerSlipCard,
} from "@/components/CustomerSlipsClient";

function formatSentAt(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    select: { monthlySerial: true, customerName: true },
  });
  if (!booking) return { title: "Customer Slips" };
  return {
    title: `Customer Slips — #${String(booking.monthlySerial).padStart(2, "0")} · ${booking.customerName}`,
  };
}

function classifyOutboundSlip(
  filename: string | null,
  body: string | null,
): "booking" | "delivery" | "return" | null {
  const name = (filename || "").toLowerCase();
  const caption = (body || "").toLowerCase();
  if (name.includes("incomplete") || caption.includes("incomplete")) return null;
  if (name.startsWith("deliveryslip_") || name.includes("delivery slip") || caption.includes("delivery slip")) {
    return "delivery";
  }
  if (
    name.startsWith("returnslip_") ||
    name.startsWith("returnreceipt_") ||
    caption.includes("return receipt") ||
    caption.includes("return slip")
  ) {
    return "return";
  }
  if (
    name.startsWith("bookingslip_") ||
    caption.includes("booking slip") ||
    /^bk-\d+\.pdf$/i.test(filename || "")
  ) {
    return "booking";
  }
  return null;
}

export default async function CustomerSlipsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) notFound();

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      bookingItems: {
        select: {
          id: true,
          isDelivered: true,
          isReturned: true,
          isIncompleteReturn: true,
        },
      },
    },
  });
  if (!booking) notFound();

  const outboundDocs = await prisma.whatsAppMessage.findMany({
    where: {
      bookingId,
      direction: "outbound",
      messageType: "document",
      status: { not: "failed" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      mediaUrl: true,
      filename: true,
      body: true,
      createdAt: true,
    },
  });

  const latestByKind: Partial<
    Record<
      "booking" | "delivery" | "return",
      { mediaUrl: string | null; filename: string | null; createdAt: Date }
    >
  > = {};

  for (const msg of outboundDocs) {
    const kind = classifyOutboundSlip(msg.filename, msg.body);
    if (!kind || latestByKind[kind]) continue;
    latestByKind[kind] = {
      mediaUrl: msg.mediaUrl,
      filename: msg.filename,
      createdAt: msg.createdAt,
    };
  }

  // Booking slip PDF is also archived on Booking.qrCodeUrl when WhatsApp send succeeds.
  const bookingArchiveUrl =
    latestByKind.booking?.mediaUrl ||
    (booking.qrCodeUrl && booking.qrCodeUrl.toLowerCase().includes(".pdf")
      ? booking.qrCodeUrl
      : null);

  const deliveryEligible = isDeliverySlipEligible(booking);
  const returnEligible = isReturnSlipEligible(booking);

  const slips: CustomerSlipCard[] = [
    {
      kind: "booking",
      title: "Booking Slip",
      subtitle: "Sent when the booking is saved",
      available: true,
      viewHref: `/booking/${bookingId}/slip`,
      pdfUrl: bookingArchiveUrl,
      sentAt: latestByKind.booking
        ? formatSentAt(latestByKind.booking.createdAt)
        : null,
      filename: latestByKind.booking?.filename || null,
    },
    {
      kind: "delivery",
      title: "Delivery Slip",
      subtitle: "Sent when dresses are marked delivered",
      available: deliveryEligible || !!latestByKind.delivery,
      unavailableReason: "Not available yet — mark delivery first.",
      viewHref: deliveryEligible ? deliverySlipHref(bookingId, booking) : null,
      pdfUrl: latestByKind.delivery?.mediaUrl || null,
      sentAt: latestByKind.delivery
        ? formatSentAt(latestByKind.delivery.createdAt)
        : null,
      filename: latestByKind.delivery?.filename || null,
    },
    {
      kind: "return",
      title: "Return Slip",
      subtitle: "Sent when dresses are marked returned",
      available: returnEligible || !!latestByKind.return,
      viewHref: returnEligible ? returnSlipHref(bookingId, booking) : null,
      pdfUrl: latestByKind.return?.mediaUrl || null,
      sentAt: latestByKind.return
        ? formatSentAt(latestByKind.return.createdAt)
        : null,
      filename: latestByKind.return?.filename || null,
      unavailableReason: "Not available yet — mark return first.",
    },
  ];

  return (
    <CustomerSlipsClient
      bookingId={bookingId}
      serialLabel={String(booking.monthlySerial).padStart(2, "0")}
      customerName={booking.customerName}
      slips={slips}
    />
  );
}
