"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downloadBookingSlipPdf } from "@/lib/bookingSlipClient";

export default function SlipActions({
  bookingId,
  autoPrint = false,
  offerPdfDownload = false,
}: {
  bookingId: number;
  autoPrint?: boolean;
  offerPdfDownload?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [showPdfHint, setShowPdfHint] = useState(offerPdfDownload);

  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setShowPdfHint(true);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  useEffect(() => {
    const onAfterPrint = () => setShowPdfHint(true);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

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

  async function downloadPdf() {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadBookingSlipPdf(bookingId);
      setShowPdfHint(false);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      {showPdfHint && (
        <div
          className="slip-screen-only no-print"
          style={{
            padding: "10px 16px",
            background: "#fff8e1",
            borderBottom: "1px solid #ffe082",
            fontSize: 13,
            color: "#5d4037",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <span>
            <i className="fa-solid fa-circle-info" style={{ marginRight: 8 }} />
            No printer or print blocked? Download the booking slip as a PDF instead.
          </span>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloading}
            className="btn btn-primary btn-sm"
            style={{ whiteSpace: "nowrap" }}
          >
            <i className="fa-solid fa-file-pdf" style={{ marginRight: 6 }} />
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      )}
      {downloadError && (
        <div className="slip-screen-only no-print alert alert-error" style={{ margin: 0, borderRadius: 0 }}>
          {downloadError}
        </div>
      )}
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
          flexWrap: "wrap",
          gap: 8,
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void downloadPdf()}
            disabled={downloading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#b45309",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 13,
              cursor: downloading ? "not-allowed" : "pointer",
              fontWeight: 600,
              opacity: downloading ? 0.75 : 1,
            }}
          >
            <i className="fa-solid fa-file-pdf" style={{ fontSize: 12 }} />
            {downloading ? "Preparing…" : "Download PDF"}
          </button>

          <button
            type="button"
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
            type="button"
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
    </>
  );
}
