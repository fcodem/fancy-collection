import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getPostponedPrintDetail } from "@/lib/services/postponedBooking";
import { formatDate } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import { requireSlipPageAccess } from "@/lib/requireSlipPageAccess";
import { isValidPdfRenderSecret } from "@/lib/slipPdfAccess";
import PrintPostponedActions from "./PrintPostponedActions";
import SlipBrandTitle from "@/components/SlipBrandTitle";
import SlipLogo from "@/components/SlipLogo";
import SlipMottoBanner from "@/components/SlipMottoBanner";
import { SLIP_BIZ } from "@/lib/slipBookingData";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Postponed Slip — #${id}` };
}

const COMPANY_NAME = SLIP_BIZ.name;
const PHONES = SLIP_BIZ.phone;

export default async function PostponedPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdfSecret?: string }>;
}) {
  const { id } = await params;
  const { pdfSecret } = await searchParams;
  await requireSlipPageAccess(pdfSecret);
  const pdfRender = isValidPdfRenderSecret(pdfSecret);

  const detail = await getPostponedPrintDetail(parseInt(id, 10));
  if (!detail) notFound();

  const { booking, lineItems, totalAdvance, postponedAt } = detail;

  const cell: CSSProperties = { padding: "8px 12px", border: "1px solid #ccc", fontSize: 13 };
  const cellR: CSSProperties = { ...cell, textAlign: "right" };

  return (
    <div
      className="print-page postponed-slip-page"
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: pdfRender ? 0 : 24,
        fontFamily: "Georgia, serif",
        background: "#fff",
      }}
    >
      <div id="postponed-slip-content" className="postponed-slip-content">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <SlipLogo size={72} />
          </div>
          <SlipBrandTitle
            name={COMPANY_NAME}
            wrapStyle={{ justifyContent: "center" }}
            nameStyle={{ fontSize: 22, fontWeight: 800, letterSpacing: 1, color: "#1a5c2a", fontFamily: "Georgia, serif" }}
            badgeStyle={{ fontSize: 11 }}
          />
          <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 6px" }}>
            <SlipMottoBanner variant="light" />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{PHONES}</p>
        </div>

        <div
          style={{
            textAlign: "center",
            padding: "12px 16px",
            marginBottom: 20,
            background: "#FFF3E0",
            border: "2px solid #E65100",
            borderRadius: 8,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: "#E65100" }}>POSTPONED BOOKING SLIP</h2>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>
            Serial No #{String(booking.monthlySerial).padStart(2, "0")} · Postponed on {postponedAt}
          </p>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={cell}><strong>Customer</strong></td>
              <td style={cell}>{booking.customerName}</td>
              <td style={cell}><strong>Contact</strong></td>
              <td style={cell}>{booking.contact1}{booking.whatsappNo ? ` / ${booking.whatsappNo}` : ""}</td>
            </tr>
            <tr>
              <td style={cell}><strong>Address</strong></td>
              <td style={cell} colSpan={3}>{booking.customerAddress}</td>
            </tr>
            <tr>
              <td style={cell}><strong>Date of Booking</strong></td>
              <td style={cell}>{formatDate(booking.createdAt, "display")}</td>
              <td style={cell}><strong>Date Postponed</strong></td>
              <td style={cell}>{postponedAt}</td>
            </tr>
            <tr>
              <td style={cell}><strong>Delivery</strong></td>
              <td style={cell}>{formatDate(booking.deliveryDate, "display")} {booking.deliveryTime}</td>
              <td style={cell}><strong>Return</strong></td>
              <td style={cell}>{formatDate(booking.returnDate, "display")} {booking.returnTime}</td>
            </tr>
            {booking.venue && (
              <tr>
                <td style={cell}><strong>Venue</strong></td>
                <td style={cell} colSpan={3}>{booking.venue}</td>
              </tr>
            )}
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={cell}>Dress</th>
              <th style={cellR}>Advance Held</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => (
              <tr key={i}>
                <td style={cell}>{li.name}</td>
                <td style={cellR}>₹{formatInr(li.advance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#FFF3E0" }}>
              <td style={{ ...cell, fontWeight: 800 }}>TOTAL PAYMENT HELD</td>
              <td style={{ ...cellR, fontWeight: 800, color: "#E65100", fontSize: 16 }}>₹{formatInr(totalAdvance)}</td>
            </tr>
          </tfoot>
        </table>

        {(booking.commonNotes || booking.notes) && (
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            <strong>Notes:</strong> {booking.commonNotes || booking.notes}
          </p>
        )}

        <p style={{ fontSize: 12, color: "#666", borderTop: "1px solid #ddd", paddingTop: 12 }}>
          This booking has been postponed. Dresses are released for new bookings. Advance amount remains on hold until resolved by the team.
        </p>
      </div>

      {!pdfRender && <PrintPostponedActions bookingId={booking.id} />}
    </div>
  );
}
