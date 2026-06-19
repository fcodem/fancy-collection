import { bookingQrDataUrl, ensureBookingQrToken } from "@/lib/bookingQr";

type Props = {
  bookingId: number;
  qrToken?: string | null;
  caption?: string;
  size?: number;
};

/** Unique booking QR — scan opens status-aware booking record. */
export default async function BookingQrDisplay({
  bookingId,
  qrToken: initialToken,
  caption = "Scan for booking details",
  size = 140,
}: Props) {
  const qrToken = initialToken || (await ensureBookingQrToken(bookingId));
  const dataUrl = await bookingQrDataUrl(qrToken);

  return (
    <div className="booking-qr-display" style={{ textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={`Booking QR code ${bookingId}`}
        width={size}
        height={size}
        style={{ display: "inline-block", border: "1px solid var(--border)", borderRadius: 8, padding: 6, background: "white" }}
      />
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, maxWidth: size + 24, marginInline: "auto" }}>
        {caption}
      </div>
    </div>
  );
}
