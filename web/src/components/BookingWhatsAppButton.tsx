"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

function formatSentAt(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BookingWhatsAppButton({
  bookingId,
  hasPhone,
  whatsappSentAt,
  whatsappStatus,
  mode = "send",
}: {
  bookingId: number;
  hasPhone: boolean;
  whatsappSentAt?: string | Date | null;
  whatsappStatus?: string | null;
  /** `resend` shows “Resend Booking Slip” and sends immediately. */
  mode?: "send" | "resend";
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const sentLabel = formatSentAt(whatsappSentAt);
  const isResend = mode === "resend" || !!whatsappSentAt || whatsappStatus === "sent";
  const label = isResend ? "Resend Booking Slip" : "Send Booking Slip";
  const title = hasPhone
    ? isResend
      ? `Resend booking slip PDF on WhatsApp${sentLabel ? ` (last sent ${sentLabel})` : ""}`
      : "Send booking slip PDF on WhatsApp"
    : "No WhatsApp number on this booking";

  async function sendWhatsApp() {
    if (!hasPhone) {
      toast("No WhatsApp number on this booking", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/${bookingId}/whatsapp`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resend: isResend }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to send booking slip on WhatsApp", "error");
        return;
      }
      if (data.paused) {
        toast(data.message || "WhatsApp receipts are paused", "error");
        return;
      }
      if (data.delivered || data.resent) {
        toast(data.message || "Booking slip sent on WhatsApp", "success");
        return;
      }
      if (data.queued) {
        toast(
          data.message || "Booking slip queued for WhatsApp delivery",
          "success",
        );
        return;
      }
      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, "_blank");
        toast("WhatsApp API not configured — opened WhatsApp manually", "success");
        return;
      }
      toast("Message prepared", "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn slip-action-btn"
      disabled={busy || !hasPhone}
      onClick={() => void sendWhatsApp()}
      title={title}
      style={{
        minHeight: 44,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: busy ? "#20bd5a" : "#25d366",
        color: "#fff",
        border: "none",
        fontWeight: 600,
        opacity: busy || !hasPhone ? 0.75 : 1,
      }}
    >
      {busy ? (
        <i className="fa-solid fa-spinner fa-spin" />
      ) : (
        <>
          <i className="fa-brands fa-whatsapp" style={{ fontSize: 16 }} />
          {label}
        </>
      )}
    </button>
  );
}
