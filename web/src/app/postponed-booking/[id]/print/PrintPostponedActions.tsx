"use client";

import Link from "next/link";

export default function PrintPostponedActions({ bookingId }: { bookingId: number }) {
  return (
    <div
      className="no-print"
      style={{
        marginTop: 24,
        textAlign: "center",
        display: "flex",
        gap: 12,
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        <i className="fa-solid fa-print" style={{ marginRight: 6 }} />
        Print Slip
      </button>
      <Link href="/postponed-booking" className="btn btn-outline">
        ← Back to Postponed Booking
      </Link>
      <Link href={`/postponed-booking/${bookingId}`} className="btn btn-outline">
        View Record
      </Link>
    </div>
  );
}
