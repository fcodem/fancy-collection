"use client";

import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";

/** Consistent control to open a booking record from any list. */
export default function ViewBookingButton({
  bookingId,
  label = "See Booking",
  className = "btn btn-sm btn-outline",
  style,
}: {
  bookingId: number | string | null | undefined;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = Number(bookingId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return (
    <PrefetchOnIntentLink
      href={`/booking/${id}`}
      className={className}
      style={style}
      title="Open full booking record"
    >
      <i className="fa-solid fa-eye" style={{ marginRight: 4 }} />
      {label}
    </PrefetchOnIntentLink>
  );
}
