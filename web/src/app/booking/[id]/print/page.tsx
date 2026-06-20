import type { Metadata } from "next";
import type { CSSProperties } from "react";
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

const GST_RATE = 18;
const GSTN = "09BJZPA3417L1ZQ";
const COMPANY_NAME = "FANCY COLLECTION BY RENU AGARWAL";
const TAGLINE = "RENT | WEAR | RETURN";
const PHONES = "8630834711, 8077843874";

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

  // Re-fetch with qrToken after ensureBookingQrToken
  const fresh = await prisma.booking.findUnique({ where: { id: booking.id }, select: { qrToken: true } });

  const subtotal = booking.totalPrice;
  const gstAmount = Math.round((subtotal * GST_RATE) / 100);
  const grandTotal = subtotal + gstAmount;

  const lineItems = booking.bookingItems.length
    ? booking.bookingItems
    : booking.dressName
      ? [{ dressName: booking.dressName, category: booking.legacyItem?.category, size: booking.legacyItem?.size, price: booking.totalPrice }]
      : [];

  const cell: CSSProperties = { padding: "8px 12px", border: "1px solid #ccc", fontSize: 13 };
  const cellR: CSSProperties = { ...cell, textAlign: "right" };

  return (
    <>
      <PrintBillActions bookingId={booking.id} />

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 20, borderBottom: "2px solid #7b1f45", paddingBottom: 14 }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>👑</div>
        <h1 style={{ fontFamily: "Playfair Display, serif", margin: "0 0 2px", fontSize: 22, color: "#7b1f45" }}>
          {COMPANY_NAME}
        </h1>
        <p style={{ margin: "2px 0", fontSize: 13, letterSpacing: 3, color: "#555", fontWeight: 600 }}>{TAGLINE}</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#555" }}>📞 {PHONES}</p>
        <p style={{ margin: "2px 0", fontSize: 11, color: "#777" }}>GSTIN: {GSTN}</p>
      </div>

      {/* ── Bill meta row ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13 }}>
          <p style={{ margin: "0 0 4px" }}><strong>Bill / Tax Invoice</strong></p>
          <p style={{ margin: "0 0 4px" }}>Serial #: <strong>{String(booking.monthlySerial).padStart(2, "0")}</strong></p>
          <p style={{ margin: "0 0 4px" }}>Booking #: {booking.bookingNumber}</p>
          <p style={{ margin: "0 0 4px" }}>Booking Date: {formatDate(booking.createdAt, "display")}</p>
          <p style={{ margin: 0 }}>Delivery: {formatDate(booking.deliveryDate, "display")} {booking.deliveryTime}</p>
          <p style={{ margin: 0 }}>Return: {formatDate(booking.returnDate, "display")} {booking.returnTime}</p>
        </div>
        <div style={{ fontSize: 13, textAlign: "right" }}>
          <p style={{ margin: "0 0 4px" }}><strong>{booking.customerName}</strong></p>
          <p style={{ margin: "0 0 4px" }}>{booking.contact1}</p>
          {booking.whatsappNo && <p style={{ margin: "0 0 4px" }}>WA: {booking.whatsappNo}</p>}
          <p style={{ margin: 0 }}>{booking.customerAddress}</p>
          {booking.venue && <p style={{ margin: "4px 0 0" }}>Venue: {booking.venue}</p>}
        </div>
        <BookingQrDisplay bookingId={booking.id} qrToken={fresh?.qrToken ?? booking.qrToken} size={90} caption="Scan to verify" />
      </div>

      {/* ── Items table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr style={{ background: "#7b1f45", color: "white" }}>
            <th style={{ ...cell, color: "white" }}>#</th>
            <th style={{ ...cell, color: "white" }}>Description</th>
            <th style={{ ...cellR, color: "white" }}>Rent (₹)</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((bi, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fdf6f9" : "white" }}>
              <td style={cell}>{i + 1}</td>
              <td style={cell}>{dressDisplayName(bi.dressName, bi.category, bi.size)}</td>
              <td style={cellR}>₹{bi.price.toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} style={cellR}><strong>Subtotal</strong></td><td style={cellR}>₹{subtotal.toLocaleString("en-IN")}</td></tr>
          <tr><td colSpan={2} style={cellR}>CGST 9% + SGST 9% = GST {GST_RATE}%</td><td style={cellR}>₹{gstAmount.toLocaleString("en-IN")}</td></tr>
          <tr style={{ fontWeight: 700, background: "#f9f0f4" }}><td colSpan={2} style={cellR}>Grand Total</td><td style={cellR}>₹{grandTotal.toLocaleString("en-IN")}</td></tr>
          <tr><td colSpan={2} style={cellR}>Advance Paid</td><td style={{ ...cellR, color: "#2d7a2d" }}>₹{booking.totalAdvance.toLocaleString("en-IN")}</td></tr>
          <tr><td colSpan={2} style={cellR}><strong>Balance Due</strong></td><td style={{ ...cellR, color: "#c0392b", fontWeight: 700 }}>₹{booking.totalRemaining.toLocaleString("en-IN")}</td></tr>
          {booking.securityDeposit > 0 && (
            <tr><td colSpan={2} style={cellR}>Security Deposit</td><td style={cellR}>₹{booking.securityDeposit.toLocaleString("en-IN")}</td></tr>
          )}
        </tfoot>
      </table>

      <p style={{ fontSize: 11, color: "#777", textAlign: "center", marginTop: 16, borderTop: "1px solid #eee", paddingTop: 10 }}>
        Thank you for choosing {COMPANY_NAME} · {TAGLINE} · {PHONES}
      </p>
    </>
  );
}
