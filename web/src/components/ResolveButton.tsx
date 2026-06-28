"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResolveButton({ bookingId }: { bookingId: number }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  return (
    <button
      className="btn btn-sm btn-primary"
      disabled={saving}
      onClick={async () => {
        if (!confirm("Mark this incomplete return as fully resolved and close the booking?")) return;
        setSaving(true);
        try {
          const res = await fetch(`/api/incomplete-return/${bookingId}/resolve`, { method: "POST" });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            alert(data.error || "Could not resolve incomplete return");
            return;
          }
          router.refresh();
        } catch {
          alert("Request failed");
        } finally {
          setSaving(false);
        }
      }}
    >
      {saving ? "Resolving…" : "Mark Returned"}
    </button>
  );
}
