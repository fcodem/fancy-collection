"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PrintPostponedActions({
  bookingId,
  justIssued = false,
}: {
  bookingId: number;
  justIssued?: boolean;
}) {
  useEffect(() => {
    if (justIssued) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const slip = document.getElementById("postponed-slip-content");
      slip?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [justIssued]);

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
      {justIssued && (
        <p style={{ width: "100%", fontSize: 13, color: "var(--text-muted)", margin: "0 0 8px" }}>
          After photographing the slip, use the buttons below or return to the postponed list.
        </p>
      )}
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
