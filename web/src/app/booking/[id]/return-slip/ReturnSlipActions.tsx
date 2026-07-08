"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ReturnSlipActions({
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
      const res = await fetch(`/api/booking/${bookingId}/return-receipt/whatsapp`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setSent(true);
        setTimeout(() => setSent(false), 4000);
      } else {
        alert(data.error || "Failed to queue return receipt");
      }
    } catch {
      alert("Request failed");
    } finally {
      setSending(false);
    }
  }

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

      <div style={{ fontSize: 15, fontWeight: 700, color: "#c9a84c" }}>Return Receipt</div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={sendWhatsApp}
          disabled={sending}
          className="slip-action-btn"
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
            minHeight: 44,
          }}
        >
          <i className="fa-brands fa-whatsapp" style={{ fontSize: 14 }} />
          <span className="slip-btn-label">
            {sent ? "Queued ✓" : sending ? "Queuing…" : "WhatsApp Send"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="slip-action-btn"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#c9a84c",
            color: "#1a5c2a",
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
    </div>
  );
}
