"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SlipActions({
  bookingId,
  autoPrint = false,
}: {
  bookingId: number;
  autoPrint?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  async function sendWhatsApp() {
    setSending(true);
    try {
      const res = await fetch(`/api/booking/${bookingId}/whatsapp`, { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setSent(true);
        setTimeout(() => setSent(false), 4000);
      } else {
        alert(data.error || "Failed to queue booking slip on WhatsApp");
      }
    } catch {
      alert("Request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="slip-screen-only no-print"
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
      }}
    >
      <Link
        href={`/booking/${bookingId}`}
        style={{ fontSize: 13, color: "#555", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
      >
        <i className="fa-solid fa-arrow-left" style={{ fontSize: 12 }} />
        Back to Booking
      </Link>

      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a5c2a" }}>Booking Slip</div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={sendWhatsApp}
          disabled={sending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: sent ? "#27ae60" : "#25d366",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "7px 14px",
            fontSize: 13,
            cursor: sending ? "not-allowed" : "pointer",
            fontWeight: 600,
            opacity: sending ? 0.7 : 1,
          }}
        >
          <i className="fa-brands fa-whatsapp" style={{ fontSize: 14 }} />
          {sent ? "Queued ✓" : sending ? "Queuing…" : "Send via WhatsApp"}
        </button>

        <button
          onClick={() => window.print()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#1a5c2a",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "7px 14px",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          <i className="fa-solid fa-print" style={{ fontSize: 12 }} />
          Print Slip
        </button>
      </div>
    </div>
  );
}
