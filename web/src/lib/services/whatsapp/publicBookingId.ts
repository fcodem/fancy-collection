/** Public-facing booking id (e.g. BK-000042). Uses internal booking id — globally unique. */
export function formatPublicBookingId(bookingId: number): string {
  return `BK-${String(bookingId).padStart(6, "0")}`;
}

export function resolvePublicBookingId(booking: {
  id: number;
  publicBookingId?: string | null;
}): string {
  return booking.publicBookingId?.trim() || formatPublicBookingId(booking.id);
}

export function bookingBillPdfFilename(publicBookingId: string): string {
  return bookingSlipPdfFilename(publicBookingId);
}

export function bookingSlipPdfFilename(publicBookingId: string): string {
  return `BookingSlip_${publicBookingId}.pdf`;
}

export function returnReceiptPdfFilename(publicBookingId: string): string {
  return `ReturnReceipt_${publicBookingId}.pdf`;
}
