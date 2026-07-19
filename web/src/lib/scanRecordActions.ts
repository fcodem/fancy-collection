export type ScanBookingRecordActions = {
  bookingId: number;
  bookingStatus: string;
  itemStatus: string;
};

export function scanRecordReasonLabel(reason: string): string {
  switch (reason) {
    case "OVERLAPPING_BOOKING":
      return "Overlapping booking in selected period";
    case "RETURNING_ON_DELIVERY_DAY":
      return "Returning on delivery date";
    case "BOOKED_ON_RETURN_DAY":
      return "Booked on return date";
    default:
      return reason.replace(/_/g, " ").toLowerCase();
  }
}

function normalizedStatus(value: string): string {
  return value.trim().toLowerCase();
}

export function canOpenDelivery(record: ScanBookingRecordActions): boolean {
  return normalizedStatus(record.bookingStatus) === "booked";
}

export function canOpenReturn(record: ScanBookingRecordActions): boolean {
  const bookingStatus = normalizedStatus(record.bookingStatus);
  const itemStatus = normalizedStatus(record.itemStatus);
  return bookingStatus === "delivered" || itemStatus === "delivered";
}

export function canOpenJewellerySelection(
  record: ScanBookingRecordActions,
): boolean {
  return normalizedStatus(record.bookingStatus) === "booked";
}
