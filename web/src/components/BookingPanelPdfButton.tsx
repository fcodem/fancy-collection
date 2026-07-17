"use client";

import { useState } from "react";

export default function BookingPanelPdfButton({
  year,
  month,
}: {
  year: number;
  month: number | null;
}) {
  const [busy, setBusy] = useState(false);
  const monthQs = month == null ? "all" : String(month);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/panel-pdf?year=${year}&month=${monthQs}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data?.headers?.length || !data?.rows?.length) {
        alert(data?.error || "No data to export");
        return;
      }
      const { downloadTablePdf } = await import("@/lib/exportTablePdf");
      downloadTablePdf({
        title: data.title,
        filename: data.filename,
        headers: data.headers,
        rows: data.rows,
        warningsBelow: data.warningsBelow,
      });
    } catch (e) {
      console.error(e);
      alert("PDF export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={onClick} disabled={busy}>
      <i className="fa-solid fa-file-pdf" style={{ marginRight: 6 }} />
      {busy ? "Preparing…" : "Download PDF"}
    </button>
  );
}
