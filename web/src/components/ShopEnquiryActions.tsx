"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export default function ShopEnquiryActions({ enquiryId }: { enquiryId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"delete" | null>(null);

  async function remove() {
    if (!confirm("Delete this shop enquiry?")) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/shop-enquiries/${enquiryId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Delete failed", "error");
        return;
      }
      toast("Shop enquiry deleted", "success");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Link href={`/shop-enquiries/${enquiryId}/edit`} className="btn btn-sm btn-outline">
        Edit
      </Link>
      <button type="button" className="btn btn-sm btn-outline" disabled={!!busy} onClick={remove}>
        {busy === "delete" ? <i className="fa-solid fa-spinner fa-spin" /> : "Delete"}
      </button>
    </div>
  );
}
