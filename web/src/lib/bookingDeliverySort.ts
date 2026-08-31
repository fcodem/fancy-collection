import { parseDate } from "@/lib/constants";
import { parseBookingTimeToMinutes } from "@/lib/bookingTimeParse";

export type DeliverySortable = {
  delivery_date?: string;
  deliveryDate?: string;
  delivery_time?: string;
  deliveryTime?: string;
  id?: number;
};

function deliveryDateMs(row: DeliverySortable): number {
  const raw = row.delivery_date || row.deliveryDate || "";
  if (!raw.trim()) return 0;
  return parseDate(raw).getTime();
}

function deliveryMinutes(row: DeliverySortable): number {
  const raw = row.delivery_time || row.deliveryTime || "";
  return parseBookingTimeToMinutes(raw) ?? 24 * 60;
}

/** Ascending: earliest delivery date/time first. */
export function compareDeliverySchedule(a: DeliverySortable, b: DeliverySortable): number {
  const dateCmp = deliveryDateMs(a) - deliveryDateMs(b);
  if (dateCmp !== 0) return dateCmp;
  const timeCmp = deliveryMinutes(a) - deliveryMinutes(b);
  if (timeCmp !== 0) return timeCmp;
  return (a.id ?? 0) - (b.id ?? 0);
}

export function sortByDeliverySchedule<T extends DeliverySortable>(rows: T[]): T[] {
  return [...rows].sort(compareDeliverySchedule);
}
