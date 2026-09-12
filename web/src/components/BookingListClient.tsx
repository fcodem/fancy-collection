"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlternateBookingTag,
  BookingWarningPanel,
} from "@/components/BookingDetailsColumns";
import type { BookingWarningRecord, StandardBookingDetails } from "@/lib/bookingDetails";
import { bookingMonthKey, formatBookingMonthLabel } from "@/lib/bookingMonth";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import StarBookingBadge from "@/components/StarBookingBadge";
import { addDaysIso, isoToDisplay } from "@/lib/dateInput";
import { warningPanelsFromItems } from "@/lib/bookingWarningPdf";
import {
  STANDARD_BOOKING_HEADERS,
  flattenBookingPdfRows,
  standardBookingPdfRow,
} from "@/lib/standardBookingPdfRows";
import { cachedFetchJson, invalidateClientCache } from "@/lib/clientRequestCache";

/** Load the full filtered period in one list (no page controls). Matches server export cap. */
const LIST_PAGE_SIZE = 500;

const TIME_SLOTS = [
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 Noon", "1:00 PM", "2:00 PM",
  "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM",
  "9:00 PM", "10:00 PM",
];

type ItemRow = {
  dress_name: string;
  display_name: string;
  category: string;
  price: number;
  notes: string;
  returning_warning: BookingWarningRecord | null;
  booked_warning: BookingWarningRecord | null;
};

type BookingRow = StandardBookingDetails & {
  id: number;
  serial_no: number;
  status: string;
  contact_1: string;
  whatsapp_no: string;
  venue: string;
  staff_names: string;
  total_advance: number;
  items: ItemRow[];
  reason?: string;
};

type ListData = {
  bookings: BookingRow[];
  unavailable: BookingRow[];
  from_date: string;
  to_date: string;
  page: number;
  pageSize: number;
  totalMain: number;
  totalUnavailable: number;
  totalPagesMain: number;
  totalPagesUnavailable: number;
};

type Categories = {
  mens_categories: string[];
  womens_categories: string[];
  jewellery_categories: string[];
  accessory_categories: string[];
};

function serialLabel(n: number) {
  return String(n || 0).padStart(2, "0");
}

function statusLabel(status: string) {
  if (status === "delivered") return "DELIVERED";
  return status.toUpperCase();
}

function dressLabel(item: ItemRow) {
  return item.display_name || item.dress_name || "—";
}

function BookingCard({ booking, isUnavailable }: { booking: BookingRow; isUnavailable?: boolean }) {
  const dresses = booking.items?.length
    ? booking.items.map(dressLabel)
    : (booking.dress_names || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const isAlternate = booking.items?.some((i) => i.returning_warning || i.booked_warning);

  return (
    <div
      className={`booked-items-simple-card${isUnavailable ? " booked-items-simple-card--unavailable" : ""}`}
    >
      <div className="booked-items-simple-customer">
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: isUnavailable
              ? "#7b2d2d"
              : "linear-gradient(135deg,var(--primary),var(--primary-light))",
            color: "white",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {serialLabel(booking.serial_no)}
        </span>
        <span>{booking.customer_name}</span>
        {booking.is_star && <StarBookingBadge />}
        {isAlternate && <AlternateBookingTag />}
      </div>

      <div className="booked-items-simple-dresses">
        {dresses.length ? (
          dresses.map((name, i) => (
            <span key={`${name}-${i}`} className="schedule-highlight schedule-highlight--dress">
              {name}
            </span>
          ))
        ) : (
          <span className="schedule-highlight schedule-highlight--dress">—</span>
        )}
      </div>

      <div className="booked-items-simple-schedule">
        <span className="schedule-highlight schedule-highlight--delivery">
          <i className="fa-solid fa-truck" style={{ marginRight: 6 }} />
          Delivery: {booking.delivery_date} {booking.delivery_time}
        </span>
        <span className="schedule-highlight schedule-highlight--return">
          <i className="fa-solid fa-rotate-left" style={{ marginRight: 6 }} />
          Return: {booking.return_date} {booking.return_time}
        </span>
      </div>

      {isUnavailable && booking.reason ? (
        <div style={{ fontSize: 12, color: "#b91c1c" }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
          {booking.reason}
        </div>
      ) : null}

      {!isUnavailable &&
        booking.items?.map((item, i) => (
          <div key={i}>
            {item.returning_warning && (
              <BookingWarningPanel w={item.returning_warning} variant="returning" />
            )}
            {item.booked_warning && (
              <BookingWarningPanel w={item.booked_warning} variant="booked" />
            )}
          </div>
        ))}
    </div>
  );
}

function buildListQueryKey(params: URLSearchParams) {
  return `booking-list:${params.toString()}`;
}

function bookingPdfRow(b: BookingRow, idx: number, unavailableFlag: boolean) {
  const itemPanels = warningPanelsFromItems(b.items || []);
  return standardBookingPdfRow(
    serialLabel(b.serial_no || idx + 1),
    {
      ...b,
      dress_names:
        b.dress_names || b.items?.map((i) => i.display_name || i.dress_name).join(", ") || "",
    },
    [unavailableFlag ? `Unavailable — ${b.reason || "—"}` : statusLabel(b.status)],
    itemPanels.length ? itemPanels : undefined,
  );
}

export default function BookingListClient({
  initialFrom,
  initialTo,
  initialData,
}: {
  initialFrom: string;
  initialTo: string;
  initialData: ListData;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [deliveryTime, setDeliveryTime] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [category, setCategory] = useState("");
  const [dressInput, setDressInput] = useState("");
  const [dressQ, setDressQ] = useState("");
  const [data, setData] = useState<ListData>(initialData);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Categories | null>(null);
  const skipFirst = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cachedFetchJson(
      "categories:all",
      async (signal) => {
        const res = await fetch("/api/categories", { credentials: "same-origin", signal });
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json() as Promise<Categories>;
      },
      { ttlMs: 25_000 },
    )
      .then(setCategories)
      .catch(() => setCategories(null));
  }, []);

  const buildParams = useCallback(
    (dressOverride?: string) => {
      const params = new URLSearchParams({
        delivery_date: from,
        return_date: to || from,
        page: "1",
        pageSize: String(LIST_PAGE_SIZE),
      });
      if (deliveryTime) params.set("delivery_time", deliveryTime);
      if (returnTime) params.set("return_time", returnTime);
      if (category) params.set("category", category);
      const dress = (dressOverride !== undefined ? dressOverride : dressQ).trim();
      if (dress) params.set("q", dress);
      return params;
    },
    [from, to, deliveryTime, returnTime, category, dressQ],
  );

  const load = useCallback(
    async (opts?: { soft?: boolean; dressOverride?: string }) => {
      if (!from) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Soft refresh keeps existing rows on screen (SSR hydrate / page-open / realtime).
      if (!opts?.soft) setLoading(true);
      try {
        const params = buildParams(opts?.dressOverride);
        const key = buildListQueryKey(params);
        const payload = await cachedFetchJson<ListData>(
          key,
          async (signal) => {
            const res = await fetch(`/api/booking-list?${params}`, {
              credentials: "same-origin",
              signal,
            });
            if (!res.ok) throw new Error("Failed to load");
            return res.json();
          },
          { ttlMs: 25_000, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setData(payload);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!opts?.soft && !controller.signal.aborted) {
          setData((prev) => ({
            ...prev,
            bookings: [],
            unavailable: [],
            from_date: from,
            to_date: to || from,
          }));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [from, to, buildParams],
  );

  const scheduleLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load();
    }, 300);
  }, [load]);

  useRealtimeRefresh(BOOKING_EVENTS, () => {
    invalidateClientCache("booking-list:");
    void load({ soft: true });
  });

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    scheduleLoad();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [from, to, deliveryTime, returnTime, category, scheduleLoad]);

  function runDressSearch() {
    const next = dressInput.trim();
    setDressQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    invalidateClientCache("booking-list:");
    void load({ dressOverride: next });
  }

  const { bookings, unavailable } = data;
  const empty = !bookings.length && !unavailable.length;
  const pdfHeaders = [...STANDARD_BOOKING_HEADERS, "Status"];

  const bookingsByMonth = useMemo(() => {
    const out: Array<
      | { type: "month"; key: string; label: string }
      | { type: "booking"; booking: BookingRow; idx: number }
    > = [];
    let lastMonth = "";
    bookings.forEach((b, idx) => {
      const key = bookingMonthKey(b.delivery_date);
      if (key && key !== lastMonth) {
        lastMonth = key;
        out.push({ type: "month", key, label: formatBookingMonthLabel(b.delivery_date) });
      }
      out.push({ type: "booking", booking: b, idx });
    });
    return out;
  }, [bookings]);

  async function exportPdfData() {
    const params = buildParams();
    params.delete("page");
    params.delete("pageSize");
    const res = await fetch(`/api/booking-list/export?${params}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Export failed");
    const exportData = (await res.json()) as {
      bookings: BookingRow[];
      unavailable: BookingRow[];
      from_date: string;
      to_date: string;
      truncated?: boolean;
    };
    const pdfResults = [
      ...exportData.bookings.map((b, idx) => bookingPdfRow(b, idx, false)),
      ...exportData.unavailable.map((b, idx) => bookingPdfRow(b, idx, true)),
    ];
    const { rows: pdfRows, warningsBelow } = flattenBookingPdfRows(pdfResults);
    return { headers: pdfHeaders, rows: pdfRows, warningsBelow };
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-list-check" style={{ marginRight: 8 }} />
            Filter Booked Items
          </h3>
          <DownloadPdfButton
            title="Booked Items"
            filename={`booked-items-${data.from_date}-to-${data.to_date}`}
            subtitle={`Period: ${isoToDisplay(data.from_date)} to ${isoToDisplay(data.to_date)}`}
            headers={pdfHeaders}
            rows={[]}
            dataFactory={exportPdfData}
            disabled={loading}
            size="sm"
          />
        </div>
        <div className="card-body">
          <div className="filter-grid-5" style={{ marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>From Date</label>
              <input
                type="date"
                className="form-control"
                value={from}
                onChange={(e) => {
                  const next = e.target.value;
                  setFrom(next);
                  if (next) setTo(addDaysIso(next, 1));
                }}
              />
            </div>
            <div>
              <label style={labelStyle}>To Date</label>
              <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Pickup Time</label>
              <select className="form-control" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)}>
                <option value="">All Times</option>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Return Time</label>
              <select className="form-control" value={returnTime} onChange={(e) => setReturnTime(e.target.value)}>
                <option value="">All Times</option>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select
                className="form-control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={!categories}
              >
                <option value="">All Categories</option>
                {categories ? (
                  <>
                    <optgroup label="Men's">
                      {categories.mens_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Women's">
                      {categories.womens_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Jewellery">
                      {categories.jewellery_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Accessories">
                      {categories.accessory_categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  <option value="" disabled>Loading categories…</option>
                )}
              </select>
            </div>
          </div>
          <div
            className="booked-items-dress-search"
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "flex-end",
              marginBottom: 16,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "#fff8f0",
            }}
          >
            <div style={{ flex: "1 1 260px", minWidth: 200 }}>
              <label style={labelStyle}>Search dresses</label>
              <input
                type="search"
                className="form-control"
                value={dressInput}
                placeholder="Type dress name, then click Search…"
                aria-label="Search dresses in booked items"
                onChange={(e) => setDressInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runDressSearch();
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={loading || !from}
              onClick={() => runDressSearch()}
              style={{ minWidth: 140 }}
            >
              <i className={`fa-solid ${loading ? "fa-spinner fa-spin" : "fa-search"}`} style={{ marginRight: 8 }} />
              {loading ? "Searching…" : "Search"}
            </button>
            {(dressQ || dressInput) && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={loading}
                onClick={() => {
                  setDressInput("");
                  setDressQ("");
                  invalidateClientCache("booking-list:");
                  void load({ dressOverride: "" });
                }}
              >
                Clear
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            <i className="fa-solid fa-info-circle" /> Shows all bookings with <strong>delivery (pickup) date</strong>{" "}
            between <strong>From</strong> and <strong>To</strong> on one list. Dresses still out from before the period
            appear under <strong>Not Available</strong>.
            {dressQ ? (
              <span style={{ marginLeft: 8 }}>
                Dress filter: <strong>{dressQ}</strong>
              </span>
            ) : null}
            {loading && <span style={{ marginLeft: 8 }}>Updating…</span>}
          </p>
        </div>
      </div>

      {!empty && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 18px", fontSize: 13 }}>
            <strong>{data.totalMain}</strong> booking{data.totalMain !== 1 ? "s" : ""} in period
          </div>
          {!!data.totalUnavailable && (
            <div style={{ background: "#7b2d2d33", border: "1.5px solid #e53e3e55", borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "#fc8181" }}>
              <strong>{data.totalUnavailable}</strong> not available
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
            Period: <strong>{isoToDisplay(data.from_date)}</strong> to{" "}
            <strong>{isoToDisplay(data.to_date)}</strong>
          </div>
        </div>
      )}

      {empty ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <p>
            No bookings found for {isoToDisplay(data.from_date)} to {isoToDisplay(data.to_date)}.
          </p>
        </div>
      ) : (
        <>
          {!!bookings.length && (
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>
              <i className="fa-solid fa-calendar-check" style={{ marginRight: 6 }} />
              Bookings in Period ({bookings.length}) — oldest delivery first
            </div>
          )}
          {bookingsByMonth.map((entry) =>
            entry.type === "month" ? (
              <div
                key={`month-${entry.key}`}
                style={{
                  margin: "16px 0 8px",
                  padding: "8px 14px",
                  background: "var(--cream-dark)",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  color: "var(--primary)",
                  borderLeft: "4px solid var(--primary)",
                }}
              >
                {entry.label}
              </div>
            ) : (
              <BookingCard key={entry.booking.id} booking={entry.booking} />
            ),
          )}

          {!!unavailable.length && (
            <div className="card" style={{ border: "2px solid #e53e3e", marginTop: 28 }}>
              <div className="card-header" style={{ background: "#7b2d2d22" }}>
                <h3 className="card-title" style={{ color: "#fc8181", fontSize: 14 }}>
                  <i className="fa-solid fa-ban" style={{ marginRight: 8 }} />
                  Not Available During Period
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                    Delivered before {isoToDisplay(data.from_date)}, return before{" "}
                    {isoToDisplay(data.to_date)}
                  </span>
                </h3>
              </div>
              <div style={{ padding: "12px 20px", fontSize: 12, color: "#feb2b2", background: "#7b2d2d11", borderBottom: "1px solid #e53e3e44" }}>
                These dresses were delivered before <strong>{isoToDisplay(data.from_date)}</strong> and
                return before <strong>{isoToDisplay(data.to_date)}</strong>. They are{" "}
                <strong>not available</strong> during this period.
              </div>
              <div style={{ padding: 12 }}>
                {unavailable.map((b) => (
                  <BookingCard key={b.id} booking={b} isUnavailable />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  marginBottom: 4,
  display: "block",
};
