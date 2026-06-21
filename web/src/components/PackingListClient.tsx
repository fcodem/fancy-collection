"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import CategorySelect from "./CategorySelect";
import {
  PackingBookingDetailsGrid,
  PackingReturningWarningPanel,
  type PackingReturningWarning,
} from "@/components/BookingDetailsColumns";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";

type PackingItem = {
  bi_id: number | null;
  dress_name: string;
  display_name?: string;
  is_packed_ready: boolean;
  prepared_by: string;
  checked_by: string;
  packing_note: string;
  returning_warning?: PackingReturningWarning | null;
};

type PackingBooking = StandardBookingDetails & {
  id: number;
  serial_no: number;
  contact_1?: string;
  whatsapp_no?: string;
  venue?: string;
  staff_names?: string;
  total_advance?: number;
  items: PackingItem[];
};

export default function PackingListClient({
  today,
  initialRows = [],
}: {
  today: string;
  initialRows?: PackingBooking[];
}) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<PackingBooking[]>(initialRows);
  const [loaded, setLoaded] = useState(initialRows.length > 0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!from) return;
    setError("");
    try {
      const res = await fetch(
        `/api/packing-list?delivery_date=${from}&return_date=${to || from}&category=${encodeURIComponent(category)}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load packing list");
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setRows(
        list.map((b: PackingBooking) => ({
          ...b,
          items: Array.isArray(b.items) ? b.items : [],
        })),
      );
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load packing list");
    } finally {
      setLoaded(true);
    }
  }, [from, to, category]);

  useRealtimeRefresh(BOOKING_EVENTS, load);

  const skipInitial = useRef(initialRows.length > 0);
  useEffect(() => {
    if (skipInitial.current) {
      skipInitial.current = false;
      return;
    }
    void load();
  }, [load]);

  async function saveItem(biId: number, patch: Partial<PackingItem>) {
    await fetch("/api/packing-list/save-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bi_id: biId, ...patch }),
    });
  }

  const allItems = rows.flatMap((b) => (Array.isArray(b.items) ? b.items : []).filter((i) => i.bi_id));
  const packed = allItems.filter((i) => i.is_packed_ready).length;

  const pdfHeaders = [
    "Serial",
    "Customer",
    "Dress",
    "Delivery",
    "Return",
    "Prepared By",
    "Checked By",
    "Packing Note",
    "Ready",
  ];

  const pdfRows = rows.flatMap((b) =>
    (b.items || []).map((item) => [
      String(b.serial_no).padStart(2, "0"),
      b.customer_name || "—",
      item.display_name || item.dress_name || "—",
      `${b.delivery_date || "—"}${b.delivery_time ? ` ${b.delivery_time}` : ""}`,
      `${b.return_date || "—"}${b.return_time ? ` ${b.return_time}` : ""}`,
      item.prepared_by || "—",
      item.checked_by || "—",
      item.packing_note || "—",
      item.is_packed_ready ? "Yes" : "No",
    ]),
  );

  return (
    <div>
      <div className="card no-print" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Filter Packing List</h3>
          <DownloadPdfButton
            title="Packing List"
            filename={`packing-list-${from}${to !== from ? `-to-${to}` : ""}`}
            subtitle={`Delivery: ${from}${to !== from ? ` to ${to}` : ""}${category ? ` · ${category}` : ""}`}
            headers={pdfHeaders}
            rows={pdfRows}
            disabled={!loaded || !pdfRows.length}
            size="sm"
          />
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}>
            <div>
              <label className="form-label">Delivery From</label>
              <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Delivery To</label>
              <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Category</label>
              <CategorySelect value={category} onChange={setCategory} />
            </div>
            <button className="btn btn-primary" onClick={load}>
              Load
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loaded && (
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          <strong>{allItems.length}</strong> items · <strong style={{ color: "#68d391" }}>{packed}</strong> packed ·{" "}
          <strong style={{ color: "#fc8181" }}>{allItems.length - packed}</strong> pending
        </div>
      )}

      {rows.map((b) => (
        <div key={b.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
            <h3 className="card-title">
              #{String(b.serial_no).padStart(2, "0")} — {b.customer_name}
            </h3>
          </div>
          <div className="card-body packing-booking-details" style={{ paddingTop: 0, paddingBottom: 16 }}>
            <PackingBookingDetailsGrid
              d={b}
              extras={{
                contact_1: b.contact_1,
                whatsapp_no: b.whatsapp_no,
                venue: b.venue,
                staff_names: b.staff_names,
                total_advance: b.total_advance,
              }}
            />
          </div>
          <div className="card-body packing-items-section">
            {b.items.map((item, idx) => (
              <div key={item.bi_id || idx} className="packing-item-block">
                <div className="packing-item-details-line">
                  <div className="packing-item-dress">
                    <span className="packing-item-dress-label">Dress</span>
                    <strong>{item.display_name || item.dress_name}</strong>
                  </div>
                  {item.returning_warning && (
                    <PackingReturningWarningPanel w={item.returning_warning} />
                  )}
                </div>
                <div className="packing-item-packing-line">
                  <div className="packing-packing-field">
                    <label className="packing-packing-label">Prepared By</label>
                    {item.bi_id ? (
                      <input
                        className="form-control"
                        defaultValue={item.prepared_by}
                        onBlur={(e) => saveItem(item.bi_id!, { prepared_by: e.target.value })}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  <div className="packing-packing-field">
                    <label className="packing-packing-label">Checked By</label>
                    {item.bi_id ? (
                      <input
                        className="form-control"
                        defaultValue={item.checked_by}
                        onBlur={(e) => saveItem(item.bi_id!, { checked_by: e.target.value })}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  <div className="packing-packing-field packing-packing-field--wide">
                    <label className="packing-packing-label">Packing Note</label>
                    {item.bi_id ? (
                      <input
                        className="form-control"
                        defaultValue={item.packing_note}
                        onBlur={(e) => saveItem(item.bi_id!, { packing_note: e.target.value })}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  <div className="packing-packing-field packing-packing-field--ready">
                    <label className="packing-packing-label">Ready</label>
                    {item.bi_id ? (
                      <input
                        type="checkbox"
                        checked={item.is_packed_ready}
                        onChange={(e) => {
                          item.is_packed_ready = e.target.checked;
                          saveItem(item.bi_id!, { is_packed_ready: e.target.checked });
                          setRows([...rows]);
                        }}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {loaded && !rows.length && (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
            No booked items in selected range.
          </div>
        </div>
      )}
    </div>
  );
}
