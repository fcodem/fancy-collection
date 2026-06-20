/** Statuses where booking is considered completed and locked for staff. */
export const COMPLETED_BOOKING_STATUSES = ["returned", "completed"] as const;

export function isBookingLocked(status: string): boolean {
  return (COMPLETED_BOOKING_STATUSES as readonly string[]).includes(status);
}

export function bookingLockedMessage() {
  return "This booking is completed and cannot be edited. Only the owner can unlock and edit it.";
}
