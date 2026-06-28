"use client";

import Link from "next/link";

export default function IncompleteSlipActions({ bookingId }: { bookingId: number }) {
  return (
    <div
      className="slip-screen-only no-print top-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <Link
        href={`/booking/${bookingId}`}
        className="slip-action-btn"
        style={{
          fontSize: 13,
          color: "#555",
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          minHeight: 44,
        }}
      >
        <i className="fa-solid fa-arrow-left" style={{ fontSize: 12 }} />
        <span className="slip-btn-label">Back</span>
      </Link>

      <div style={{ fontSize: 15, fontWeight: 700, color: "#c2410c" }}>Incomplete Return Slip</div>

      <button
        type="button"
        onClick={() => window.print()}
        className="slip-action-btn"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#c2410c",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "7px 14px",
          fontSize: 13,
          cursor: "pointer",
          fontWeight: 600,
          minHeight: 44,
        }}
      >
        <i className="fa-solid fa-print" style={{ fontSize: 12 }} />
        <span className="slip-btn-label">Print</span>
      </button>
    </div>
  );
}
