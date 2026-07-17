"use client";

/**
 * Delete button for detail pages — soft-navigates without hard reload.
 * List page uses inline delete in InventoryListClient instead.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InventoryDeleteButton({
  id,
  label,
  onDeleted,
}: {
  id: number;
  label?: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    const name = label || "this dress";
    if (!confirm(`Delete ${name} from inventory? This cannot be undone.`)) return;
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((data as { error?: string }).error || "Delete failed");
        return;
      }
      if (onDeleted) {
        onDeleted();
      } else {
        router.replace("/inventory");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-sm btn-danger"
      onClick={handleDelete}
      disabled={pending}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
