/** Public-facing display id (e.g. BK-000042). Not used for authentication. */
export function formatPublicBookingId(bookingId: number): string {
  return `BK-${String(bookingId).padStart(6, "0")}`;
}

export function resolvePublicBookingId(booking: {
  id: number;
  publicBookingId?: string | null;
}): string {
  return booking.publicBookingId?.trim() || formatPublicBookingId(booking.id);
}

/** Reject enumerable BK-###### as public-access credentials. */
export function isEnumerablePublicBookingId(value: string): boolean {
  return /^BK-\d{1,8}$/i.test(value.trim());
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
