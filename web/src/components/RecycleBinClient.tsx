"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import BookingConflictSummary, { type BookingDateCheckRow } from "@/components/BookingConflictSummary";
import { fetchJson } from "@/lib/fetchJson";
import type { StandardBookingDetails } from "@/lib/bookingDetails";

type RecycleRow = StandardBookingDetails & {
  id: number;
  serial: number;
  items: Array<{ display_name: string }>;
};

type RestoreCheck = {
  booking: {
    id: number;
    customer_name: string;
    serial: number;
    delivery_date: string;
    return_date: string;
  };
  results: BookingDateCheckRow[];
  canRestore: boolean;
  hasWarnings: boolean;
};

export default function RecycleBinClient() {
  const router = useRouter();
  const [rows, setRows] = useState<RecycleRow[]>([]);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreModal, setRestoreModal] = useState<{
    row: RecycleRow;
    check: RestoreCheck | null;
    loading: boolean;
    restoring: boolean;
    error: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/recycle-bin")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {});
  }, []);

  async function runRestore(bookingId: number, acknowledgeWarnings: boolean) {
    const res = await fetch(`/api/recycle-bin/${bookingId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledge_warnings: acknowledgeWarnings }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Restore failed") as Error & { payload?: typeof data };
      err.payload = data;
      throw err;
    }
    return data;
  }

  async function openRestore(row: RecycleRow) {
    setRestoringId(row.id);
    try {
      const check = await fetchJson<RestoreCheck>(`/api/recycle-bin/${row.id}/restore-check`);

      if (check.canRestore && !check.hasWarnings) {
        await runRestore(row.id, false);
        router.refresh();
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        return;
      }

      setRestoreModal({ row, check, loading: false, restoring: false, error: "" });
    } catch (e) {
      const payload = (e as Error & { payload?: Record<string, unknown> }).payload;
      if (payload?.results) {
        setRestoreModal({
          row,
          check: {
            booking: (payload.booking as RestoreCheck["booking"]) || {
              id: row.id,
              customer_name: row.customer_name,
              serial: row.serial,
              delivery_date: row.delivery_date,
              return_date: row.return_date,
            },
            results: payload.results as BookingDateCheckRow[],
            canRestore: Boolean(payload.canRestore),
            hasWarnings: Boolean(payload.hasWarnings),
          },
          loading: false,
          restoring: false,
          error: e instanceof Error ? e.message : "Could not check availability",
        });
      } else {
        setRestoreModal({
          row,
          check: null,
          loading: false,
          restoring: false,
          error: e instanceof Error ? e.message : "Could not check availability",
        });
      }
    } finally {
      setRestoringId(null);
    }
  }

  async function confirmRestore(bookingId: number, acknowledgeWarnings: boolean) {
    setRestoreModal((m) => (m ? { ...m, restoring: true, error: "" } : m));
    try {
      await runRestore(bookingId, acknowledgeWarnings);
      setRestoreModal(null);
      router.refresh();
      setRows((prev) => prev.filter((r) => r.id !== bookingId));
    } catch (e) {
      const payload = (e as Error & { payload?: Record<string, unknown> }).payload;
      setRestoreModal((m) => {
        if (!m) return m;
        const next = { ...m, restoring: false, error: e instanceof Error ? e.message : "Restore failed" };
        if (payload?.results) {
          next.check = {
            booking: (payload.booking as RestoreCheck["booking"]) || m.check!.booking,
            results: payload.results as BookingDateCheckRow[],
            canRestore: Boolean(payload.canRestore),
            hasWarnings: Boolean(payload.hasWarnings),
          };
        }
        return next;
      });
    }
  }

  async function del(id: number) {
    if (!confirm("Permanently delete this booking?")) return;
    await fetch(`/api/recycle-bin/${id}`, { method: "DELETE" });
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const modal = restoreModal;

  return (
    <div>
      <div className="card">
        <div className="card-header"><h3 className="card-title">Recycle Bin</h3></div>
        <div className="card-body p-0">
          <p style={{ padding: "12px 20px", margin: 0, fontSize: 13, color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            Restore checks dress availability first. Double-bookings are blocked. Same-day return/delivery warnings are shown with full booking details — you may still restore after confirming.
          </p>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <StandardBookingTableHead />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>{String(b.serial).padStart(2, "0")}</td>
                    <StandardBookingTableCells d={b} />
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ marginRight: 8 }}
                        disabled={restoringId === b.id}
                        onClick={() => openRestore(b)}
                      >
                        {restoringId === b.id ? (
                          <><i className="fa-solid fa-spinner fa-spin" /> Checking…</>
                        ) : (
                          "Restore"
                        )}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => del(b.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !modal.restoring && setRestoreModal(null)}
          onKeyDown={() => {}}
          role="presentation"
        >
          <div
            className="card"
            style={{ maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
            role="dialog"
            aria-modal
          >
            <div className="card-header">
              <h3 className="card-title">
                Restore Booking #{String(modal.row.serial).padStart(2, "0")} — {modal.row.customer_name}
              </h3>
            </div>
            <div className="card-body">
              {modal.loading ? (
                <BookingConflictSummary results={[]} loading />
              ) : modal.error && !modal.check ? (
                <div className="alert alert-error">{modal.error}</div>
              ) : modal.check ? (
                <>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
                    Delivery {modal.check.booking.delivery_date} · Return {modal.check.booking.return_date}
                  </p>
                  <BookingConflictSummary
                    results={modal.check.results}
                    allowLabel="restore is allowed after you confirm"
                  />
                  {modal.error && <div className="alert alert-error" style={{ marginTop: 12 }}>{modal.error}</div>}
                </>
              ) : null}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={modal.restoring}
                  onClick={() => setRestoreModal(null)}
                >
                  Cancel
                </button>
                {modal.check?.canRestore && modal.check.hasWarnings && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={modal.restoring || modal.loading}
                    onClick={() => confirmRestore(modal.row.id, true)}
                  >
                    {modal.restoring ? (
                      <><i className="fa-solid fa-spinner fa-spin" /> Restoring…</>
                    ) : (
                      "Restore Anyway"
                    )}
                  </button>
                )}
                {modal.check && !modal.check.canRestore && (
                  <span style={{ fontSize: 12, color: "var(--danger)", alignSelf: "center" }}>
                    Cannot restore — dress already booked for overlapping dates.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
