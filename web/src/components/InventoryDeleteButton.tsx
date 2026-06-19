"use client";

export default function InventoryDeleteButton({
  id,
  label,
}: {
  id: number;
  label?: string;
}) {
  async function handleDelete() {
    const name = label || "this dress";
    if (!confirm(`Delete ${name} from inventory? This cannot be undone.`)) return;
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((data as { error?: string }).error || "Delete failed");
      return;
    }
    window.location.href = "/inventory";
  }

  return (
    <button type="button" className="btn btn-sm btn-danger" onClick={handleDelete}>
      Delete
    </button>
  );
}
