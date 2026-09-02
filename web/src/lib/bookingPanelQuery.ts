import type { Prisma } from "@prisma/client";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";

/** Dresses still out with customers — always visible on the panel even when filtering another month. */
const OUTSTANDING_PANEL_STATUSES = ["delivered", "incomplete_return"] as const;

/** Active panel rows: selected month (booked + delivered) plus any not-yet-returned outfits. */
export function bookingPanelActiveWhere(
  panelDeliveryWhere: Prisma.BookingWhereInput,
  month: number | null,
): Prisma.BookingWhereInput {
  const inSelectedPeriod: Prisma.BookingWhereInput = {
    ...panelDeliveryWhere,
    status: { in: ["booked", "delivered"] },
  };
  if (month == null) return inSelectedPeriod;
  return {
    OR: [inSelectedPeriod, { status: { in: [...OUTSTANDING_PANEL_STATUSES] } }],
  };
}

/** Stats for the panel cards — include outstanding returns when a single month is selected. */
export function bookingPanelStatsWhere(
  panelDeliveryWhere: Prisma.BookingWhereInput,
  month: number | null,
): Prisma.BookingWhereInput {
  const base = { ...activeBookingWhere(), ...panelDeliveryWhere };
  if (month == null) return base;
  return {
    ...activeBookingWhere(),
    OR: [panelDeliveryWhere, { status: { in: [...OUTSTANDING_PANEL_STATUSES] } }],
  };
}
