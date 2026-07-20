"use client";

import { useCallback, useState } from "react";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import type { PdfWarningPanel } from "@/lib/pdfWarningDraw";
import { recordBookingPdfHeaders, recordBookingPdfRow, flattenBookingPdfRows } from "@/lib/standardBookingPdfRows";

type LateReturnRow = {
  id: number;
  monthlySerial: number;
  daysLate: number;
  details: StandardBookingDetails;
};

type PageData = {
  rows: LateReturnRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function LateReturnClient({ initial }: { initial: PageData }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [pdfRows, setPdfRows] = useState<{
    headers: string[];
    rows: string[][];
    warningsBelow: (PdfWarningPanel[] | undefined)[];
  } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const loadPage = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/late-return?page=${page}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch("/api/late-return/export", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Export failed");
      const payload = await res.json();
      setPdfRows(payload);
    } finally {
      setPdfLoading(false);
    }
  }

  const pdfHeaders = recordBookingPdfHeaders("Days Late");
  const exportReady = pdfRows?.rows?.length;

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ color: "var(--danger)" }}>
          Late Returns ({data.total}){loading ? " …" : ""}
        </h3>
        {data.total > 0 && (
          <DownloadPdfButton
            title="Late Returns"
            filename="late-returns"
            headers={exportReady ? pdfRows!.headers : pdfHeaders}
            rows={exportReady ? pdfRows!.rows : []}
            warningsBelow={exportReady ? pdfRows!.warningsBelow : []}
            disabled={pdfLoading}
            onBeforeOpen={exportReady ? undefined : loadPdf}
            size="sm"
          />
        )}
      </div>
      <div className="card-body p-0">
        {data.rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No late returns.</div>
        ) : (
          <>
            <div className="table-wrapper">
              <table id="late-return-table" className="data-table data-table--booking">
                <thead>
                  <tr>
                    <th className="booking-col-serial">S.No</th>
                    <StandardBookingTableHead />
                    <th className="booking-col-date">Days Late</th>
                    <th className="booking-col-actions">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((b) => (
                    <tr key={b.id}>
                      <td className="booking-col-serial">
                        <strong>{String(b.monthlySerial).padStart(2, "0")}</strong>
                      </td>
                      <StandardBookingTableCells d={b.details} />
                      <td className="booking-col-date">
                        <span className="badge badge-overdue">{b.daysLate} days</span>
                      </td>
                      <td className="booking-col-actions">
                        <PrefetchOnIntentLink href={`/return/${b.id}`} className="btn btn-sm btn-primary">
                          Process Return
                        </PrefetchOnIntentLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.totalPages > 1 && (
              <div style={{ padding: 16, display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={data.page <= 1 || loading}
                  onClick={() => loadPage(data.page - 1)}
                >
                  Previous
                </button>
                <span style={{ fontSize: 13 }}>
                  Page {data.page} / {data.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={data.page >= data.totalPages || loading}
                  onClick={() => loadPage(data.page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
