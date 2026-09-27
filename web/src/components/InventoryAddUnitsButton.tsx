"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

type Props = {
  itemId: number;
  onAdded?: (totalQuantity: number) => void;
  /** Refresh the current server-rendered route after adding. */
  refreshRoute?: boolean;
};

export default function InventoryAddUnitsButton({ itemId, onAdded, refreshRoute }: Props) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const quantity = Math.max(1, Math.min(Number(qty) || 1, 50));
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/${itemId}/units`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        total_quantity?: number;
      };
      if (!res.ok) {
        showToast(data.error || "Could not add units", "error");
        return;
      }
      showToast(
        `Added ${quantity} unit${quantity === 1 ? "" : "s"} (total ${data.total_quantity ?? "?"})`,
        "success",
      );
      setOpen(false);
      setQty("1");
      onAdded?.(data.total_quantity ?? 0);
      if (refreshRoute) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-outline" onClick={() => setOpen(true)}>
        + Add units
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="form-control"
        style={{ width: 70, padding: "4px 8px" }}
        aria-label="Units to add"
        autoFocus
      />
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline"
        disabled={busy}
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </span>
  );
}
