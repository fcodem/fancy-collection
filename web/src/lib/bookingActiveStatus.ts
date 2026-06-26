/** Bookings hidden from lists, finance, and availability blocking. */
export const INACTIVE_BOOKING_STATUSES = ["cancelled", "postponed"] as const;

export type InactiveBookingStatus = (typeof INACTIVE_BOOKING_STATUSES)[number];

/** Prisma filter — active bookings only (excludes cancelled & postponed). */
export function activeBookingWhere() {
  return { status: { notIn: [...INACTIVE_BOOKING_STATUSES] } as { notIn: string[] } };
}
