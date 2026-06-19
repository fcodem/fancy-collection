"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PrintBillActions({
  bookingId,
  autoPrint = false,
}: {
  bookingId: number;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  return (
    <div className="no-print print-bill-actions">
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        Print Bill
      </button>
      <Link href={`/booking/${bookingId}`} className="btn btn-outline">
        ← Back to Booking
      </Link>
    </div>
  );
}
