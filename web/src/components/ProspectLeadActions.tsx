"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export default function ProspectLeadActions({ leadId, hasPhone }: { leadId: number; hasPhone: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"reminder" | "delete" | null>(null);

  async function sendReminder() {
    if (!hasPhone) {
      toast("No WhatsApp or contact number on this lead", "error");
      return;
    }
    setBusy("reminder");
    try {
      const res = await fetch(`/api/prospect-leads/${leadId}/reminder`, { method: "POST", credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to send reminder", "error");
        return;
      }
      if (data.whatsappUrl) window.open(data.whatsappUrl, "_blank");
      toast(
        data.availability?.all_available
          ? "All dresses available — WhatsApp opened"
          : "Some dresses unavailable — WhatsApp opened",
        "success",
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this prospect lead?")) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/prospect-leads/${leadId}`, { method: "DELETE", credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Delete failed", "error");
        return;
      }
      toast("Prospect lead deleted", "success");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={!!busy || !hasPhone}
        onClick={sendReminder}
        title={hasPhone ? "Check availability & open WhatsApp" : "No phone number"}
      >
        {busy === "reminder" ? (
          <i className="fa-solid fa-spinner fa-spin" />
        ) : (
          <>
            <i className="fa-brands fa-whatsapp" style={{ marginRight: 4 }} />
            Reminder
          </>
        )}
      </button>
      <button type="button" className="btn btn-sm btn-outline" disabled={!!busy} onClick={remove}>
        {busy === "delete" ? <i className="fa-solid fa-spinner fa-spin" /> : "Delete"}
      </button>
    </div>
  );
}
