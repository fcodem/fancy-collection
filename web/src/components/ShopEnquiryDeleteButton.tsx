"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export default function ShopEnquiryDeleteButton({ enquiryId }: { enquiryId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Delete this shop enquiry?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/shop-enquiries/${enquiryId}`, { method: "DELETE", credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Delete failed", "error");
        return;
      }
      toast("Shop enquiry deleted", "success");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={remove}>
      {busy ? <i className="fa-solid fa-spinner fa-spin" /> : "Delete"}
    </button>
  );
}
