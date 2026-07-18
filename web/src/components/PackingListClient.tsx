"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import CategorySelect from "./CategorySelect";
import {
  PackingBookingDetailsGrid,
  PackingReturningWarningPanel,
  BookingCardHeaderDates,
  type PackingReturningWarning,
} from "@/components/BookingDetailsColumns";
import type { StandardBookingDetails } from "@/lib/bookingDetails";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import { CustomOrdersSection, type SlipOrderDisplay } from "@/components/BookingSlip";
import { panelsForItemWarnings } from "@/lib/bookingWarningPdf";
import { STANDARD_BOOKING_HEADERS, flattenBookingPdfRows, standardBookingPdfRow } from "@/lib/standardBookingPdfRows";
import StarBookingBadge from "@/components/StarBookingBadge";

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
  is_star?: boolean;
  items: PackingItem[];
  orders?: SlipOrderDisplay[];
};

export default function PackingListClient({
  today,
  initialRows = [],
  initialLoaded = false,
  initialNextCursor = null,
  initialHasMore = false,
}: {
  today: string;
  initialRows?: PackingBooking[];
  /** True when SSR already completed a fetch (even if zero rows). */
  initialLoaded?: boolean;
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
}) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [category, setCategory] = useState("");
  const [rows, setRows] = useState<PackingBooking[]>(initialRows);
  const [loaded, setLoaded] = useState(initialLoaded || initialRows.length > 0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [saveStatus, setSaveStatus] = useState<Record<number, "saving" | "saved" | "error">>({});
  const loadAbortRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<string | null>(initialNextCursor);
  const saveQueue = useRef<Map<number, Partial<PackingItem> & { timer?: ReturnType<typeof setTimeout> }>>(
    new Map(),
  );

  const load = useCallback(async (append = false) => {
    if (!from) return;
    if (!append) nextCursorRef.current = null;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setError("");
    setLoading(true);
    try {
      const params = new URLSearchParams({
        delivery_from: from,
        delivery_to: to || from,
        category,
        limit: "20",
      });
      if (append && nextCursorRef.current) params.set("cursor", nextCursorRef.current);
      const res = await fetch(
        `/api/packing-list?${params.toString()}`,
        { credentials: "same-origin", signal: controller.signal },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load packing list");
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
      const normalized = list.map((b: PackingBooking) => ({
          ...b,
          items: Array.isArray(b.items) ? b.items : [],
        }));
      setRows((previous) => append ? [...previous, ...normalized] : normalized);
      nextCursorRef.current = typeof data?.nextCursor === "string" ? data.nextCursor : null;
      setHasMore(Boolean(data?.hasMore));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load packing list");
    } finally {
      setLoaded(true);
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [from, to, category]);

  useRealtimeRefresh(BOOKING_EVENTS, () => void load(false));

  // Empty SSR result is still a completed result — do not immediately refetch.
  const skipInitial = useRef(Boolean(initialLoaded));
  useEffect(() => {
    if (skipInitial.current) {
      skipInitial.current = false;
      return;
    }
    const timer = setTimeout(() => void load(false), 300);
    return () => clearTimeout(timer);
  }, [load]);

  async function flushSave(biId: number, keepalive = false) {
    const entry = saveQueue.current.get(biId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    const { timer: _t, ...patch } = entry;
    saveQueue.current.delete(biId);
    if (!Object.keys(patch).length) return;
    setSaveStatus((previous) => ({ ...previous, [biId]: "saving" }));
    try {
      const response = await fetch("/api/packing-list/save-item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bi_id: biId, ...patch }),
        keepalive,
      });
      if (!response.ok) throw new Error("Save failed");
      setSaveStatus((previous) => ({ ...previous, [biId]: "saved" }));
    } catch {
      saveQueue.current.set(biId, patch);
      setSaveStatus((previous) => ({ ...previous, [biId]: "error" }));
    }
  }

  async function flushAll(keepalive = false) {
    await Promise.all(
      [...saveQueue.current.keys()].map((biId) => flushSave(biId, keepalive)),
    );
  }

  function queueSave(biId: number, patch: Partial<PackingItem>, immediate = false) {
    const prev = saveQueue.current.get(biId) || {};
    if (prev.timer) clearTimeout(prev.timer);
    const next = { ...prev, ...patch };
    if (immediate) {
      saveQueue.current.set(biId, next);
      void flushSave(biId);
      return;
    }
    next.timer = setTimeout(() => {
      void flushSave(biId);
    }, 500);
    saveQueue.current.set(biId, next);
  }

  function saveItem(biId: number, patch: Partial<PackingItem>) {
    const immediate = Object.prototype.hasOwnProperty.call(patch, "is_packed_ready");
    queueSave(biId, patch, immediate);
  }

  function updateItem<K extends keyof PackingItem>(
    biId: number,
    field: K,
    value: PackingItem[K],
  ) {
    const current = rows
      .flatMap((booking) => booking.items)
      .find((item) => item.bi_id === biId);
    if (!current || current[field] === value) return;
    setRows((previous) =>
      previous.map((booking) => ({
        ...booking,
        items: booking.items.map((item) => {
          if (item.bi_id !== biId || item[field] === value) return item;
          return { ...item, [field]: value };
        }),
      })),
    );
    saveItem(biId, { [field]: value } as Partial<PackingItem>);
  }

  useEffect(() => {
    const flushOnLeave = () => {
      void flushAll(true);
    };
    window.addEventListener("pagehide", flushOnLeave);
    return () => {
      window.removeEventListener("pagehide", flushOnLeave);
      loadAbortRef.current?.abort();
      void flushAll(true);
    };
    // Queue refs intentionally remain stable for the component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allItems = rows.flatMap((b) => (Array.isArray(b.items) ? b.items : []).filter((i) => i.bi_id));
  const packed = allItems.filter((i) => i.is_packed_ready).length;

  function buildPdfData() {
    const headers = [
      ...STANDARD_BOOKING_HEADERS,
      "Prepared By",
      "Checked By",
      "Packing Note",
      "Ready",
    ];
    const results = rows.flatMap((b) =>
      (b.items || []).map((item) =>
        standardBookingPdfRow(
          b.serial_no,
          {
            ...b,
            dress_names: item.display_name || item.dress_name || b.dress_names,
          },
          [
            item.prepared_by || "—",
            item.checked_by || "—",
            item.packing_note || "—",
            item.is_packed_ready ? "Yes" : "No",
          ],
          panelsForItemWarnings(
            item.returning_warning,
            null,
            item.display_name || item.dress_name,
          ),
        ),
      ),
    );
    const flattened = flattenBookingPdfRows(results);
    return {
      headers,
      rows: flattened.rows,
      warningsBelow: flattened.warningsBelow,
    };
  }

  return (
    <div>
      <div className="card no-print" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Filter Packing List</h3>
          <DownloadPdfButton
            title="Packing List"
            filename={`packing-list-${from}${to !== from ? `-to-${to}` : ""}`}
            subtitle={`Delivery: ${from}${to !== from ? ` to ${to}` : ""}${category ? ` · ${category}` : ""}`}
            dataFactory={buildPdfData}
            disabled={!loaded || !allItems.length}
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
            <button className="btn btn-primary" onClick={() => void load(false)} disabled={loading}>
              {loading ? "Loading…" : "Load"}
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
            <h3 className="card-title" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
              #{String(b.serial_no).padStart(2, "0")} — {b.customer_name}
              {b.is_star && <StarBookingBadge />}
            </h3>
            <BookingCardHeaderDates d={b} />
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
                        value={item.prepared_by}
                        onChange={(e) => updateItem(item.bi_id!, "prepared_by", e.target.value)}
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
                        value={item.checked_by}
                        onChange={(e) => updateItem(item.bi_id!, "checked_by", e.target.value)}
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
                        value={item.packing_note}
                        onChange={(e) => updateItem(item.bi_id!, "packing_note", e.target.value)}
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
                        onChange={(e) => updateItem(item.bi_id!, "is_packed_ready", e.target.checked)}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  {item.bi_id && saveStatus[item.bi_id] && (
                    <div style={{ fontSize: 11, color: saveStatus[item.bi_id] === "error" ? "var(--danger)" : "var(--text-muted)" }}>
                      {saveStatus[item.bi_id] === "saving" && "Saving…"}
                      {saveStatus[item.bi_id] === "saved" && "Saved"}
                      {saveStatus[item.bi_id] === "error" && (
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => void flushSave(item.bi_id!)}>
                          Error · Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {b.orders && b.orders.length > 0 && (
            <div className="card-body" style={{ paddingTop: 0 }}>
              <CustomOrdersSection orders={b.orders} showPhoto={false} />
            </div>
          )}
        </div>
      ))}

      {hasMore && (
        <div style={{ textAlign: "center", margin: "8px 0 24px" }}>
          <button type="button" className="btn btn-outline" disabled={loading} onClick={() => void load(true)}>
            {loading ? "Loading…" : "Load More Bookings"}
          </button>
        </div>
      )}

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
