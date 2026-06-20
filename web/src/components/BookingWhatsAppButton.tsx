"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export default function BookingWhatsAppButton({
  bookingId,
  hasPhone,
}: {
  bookingId: number;
  hasPhone: boolean;
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
      const res = await fetch(`/api/booking/${bookingId}/whatsapp`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to send WhatsApp", "error");
        return;
      }
      if (data.delivered) {
        toast("Booking confirmation sent via AiSensy", "success");
        return;
      }
      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, "_blank");
        toast("AiSensy not configured — opened WhatsApp manually", "success");
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
      className="btn btn-outline"
      disabled={busy || !hasPhone}
      onClick={sendWhatsApp}
      title={hasPhone ? "Send booking confirmation on WhatsApp" : "No WhatsApp number"}
    >
      {busy ? (
        <i className="fa-solid fa-spinner fa-spin" />
      ) : (
        <>
          <i className="fa-brands fa-whatsapp" style={{ marginRight: 6 }} />
          Send WhatsApp
        </>
      )}
    </button>
  );
}
