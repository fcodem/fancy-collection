"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export default function BookingWhatsAppButton({
  bookingId,
  hasPhone,
  whatsappStatus,
}: {
  bookingId: number;
  hasPhone: boolean;
  whatsappStatus?: string | null;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function sendWhatsApp() {
    if (!hasPhone) {
      toast("No WhatsApp number on this booking", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/${bookingId}/resend-whatsapp`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to send WhatsApp", "error");
        return;
      }
      if (data.delivered) {
        const phone = data.phone ? `+${String(data.phone).replace(/^\+/, "")}` : "";
        toast(
          `WhatsApp confirmation sent to ${data.customerName || "customer"}${phone ? ` on ${phone}` : ""}`,
          "success",
        );
        return;
      }
      toast(data.error || "⚠️ WhatsApp message failed — check logs", "error");
    } finally {
      setBusy(false);
    }
  }

  const statusHint =
    whatsappStatus === "sent"
      ? "Last sent successfully"
      : whatsappStatus === "failed"
        ? "Last attempt failed"
        : whatsappStatus === "pending"
          ? "Sending in progress"
          : undefined;

  return (
    <button
      type="button"
      className="btn btn-outline"
      disabled={busy || !hasPhone}
      onClick={sendWhatsApp}
      title={hasPhone ? statusHint || "Resend booking confirmation on WhatsApp" : "No WhatsApp number"}
    >
      {busy ? (
        <i className="fa-solid fa-spinner fa-spin" />
      ) : (
        <>
          <i className="fa-brands fa-whatsapp" style={{ marginRight: 6 }} />
          Resend WhatsApp
        </>
      )}
    </button>
  );
}
