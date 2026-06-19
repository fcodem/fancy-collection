import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { dressDisplayName } from "@/lib/dress";
import { formatDate } from "@/lib/constants";
import BookingQrDisplay from "@/components/BookingQrDisplay";
import { ensureBookingQrToken } from "@/lib/bookingQr";
import PrintBillActions from "./PrintBillActions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    select: { monthlySerial: true },
  });
  if (!booking) return { title: "Print Bill" };
  return {
    title: `Bill — #${String(booking.monthlySerial).padStart(2, "0")}`,
  };
}

export default async function BookingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(id, 10) },
    include: { bookingItems: true, legacyItem: true },
  });
  if (!booking) notFound();

  await ensureBookingQrToken(booking.id);

  const gstRate = 0;
  const subtotal = booking.totalPrice;
  const gstAmount = (subtotal * gstRate) / 100;
  const grandTotal = subtotal + gstAmount;

  const lineItems = booking.bookingItems.length
    ? booking.bookingItems
    : booking.dressName
      ? [
          {
            dressName: booking.dressName,
            category: booking.legacyItem?.category,
            size: booking.legacyItem?.size,
            price: booking.totalPrice,
          },
        ]
      : [];

  return (
    <>
      <PrintBillActions bookingId={booking.id} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center", flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: "Playfair Display, serif", margin: 0 }}>👑 Fancy Collection</h1>
          <p style={{ margin: "8px 0 0" }}>Rental Bill / Receipt</p>
        </div>
        <BookingQrDisplay bookingId={booking.id} qrToken={booking.qrToken} size={100} caption="Scan for booking" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, fontSize: 14, flexWrap: "wrap", gap: 16 }}>
        <div>
          <p><strong>Serial #:</strong> {String(booking.monthlySerial).padStart(2, "0")}</p>
          <p><strong>Booking #:</strong> {booking.bookingNumber}</p>
          <p><strong>Date:</strong> {formatDate(booking.deliveryDate, "display")}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p><strong>{booking.customerName}</strong></p>
          <p>{booking.contact1}</p>
          <p>{booking.customerAddress}</p>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((bi, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{dressDisplayName(bi.dressName, bi.category, bi.size)}</td>
              <td>{bi.price.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} style={{ textAlign: "right" }}>Subtotal</td><td>₹{subtotal.toLocaleString()}</td></tr>
          <tr><td colSpan={2} style={{ textAlign: "right" }}>GST ({gstRate}%)</td><td>₹{gstAmount.toLocaleString()}</td></tr>
          <tr style={{ fontWeight: 700 }}><td colSpan={2} style={{ textAlign: "right" }}>Grand Total</td><td>₹{grandTotal.toLocaleString()}</td></tr>
          <tr><td colSpan={2} style={{ textAlign: "right" }}>Advance Paid</td><td>₹{booking.totalAdvance.toLocaleString()}</td></tr>
          <tr><td colSpan={2} style={{ textAlign: "right" }}>Balance Due</td><td>₹{booking.totalRemaining.toLocaleString()}</td></tr>
          <tr><td colSpan={2} style={{ textAlign: "right" }}>Security Deposit</td><td>₹{booking.securityDeposit.toLocaleString()}</td></tr>
        </tfoot>
      </table>
      <p style={{ marginTop: 24, fontSize: 12, textAlign: "center" }}>
        Delivery: {formatDate(booking.deliveryDate, "display")} {booking.deliveryTime} · Return:{" "}
        {formatDate(booking.returnDate, "display")} {booking.returnTime}
      </p>
    </>
  );
}
