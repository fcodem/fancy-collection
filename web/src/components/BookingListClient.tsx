"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BookingWarningPanel,
  BookingCardHeaderDates,
  PackingBookingDetailsGrid,
} from "@/components/BookingDetailsColumns";
import type { BookingWarningRecord, StandardBookingDetails } from "@/lib/bookingDetails";
import { bookingMonthKey, formatBookingMonthLabel } from "@/lib/bookingMonth";
import { formatInr } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS } from "@/lib/realtime/types";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import StarBookingBadge from "@/components/StarBookingBadge";
import { addDaysIso } from "@/lib/dateInput";
import { warningPanelsFromItems } from "@/lib/bookingWarningPdf";
import {
  STANDARD_BOOKING_HEADERS,
  flattenBookingPdfRows,
  standardBookingPdfRow,
} from "@/lib/standardBookingPdfRows";
import { cachedFetchJson, invalidateClientCache } from "@/lib/clientRequestCache";

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

function statusBadgeClass(status: string): string {
  if (status === "delivered") return "badge-success";
  if (status === "returned") return "badge-info";
  if (status === "booked") return "badge-warning";
  return "badge-secondary";
}

function statusLabel(status: string): string {
  if (status === "delivered") return "DELIVERED";
  return status.toUpperCase();
}

function BookingCard({ booking, idx, isUnavailable }: { booking: BookingRow; idx: number; isUnavailable?: boolean }) {
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: isUnavailable ? "4px solid #e53e3e" : undefined }}>
      <div className="card-header booking-card-header" style={{ padding: "12px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: isUnavailable ? "#7b2d2d" : "linear-gradient(135deg,var(--primary),var(--primary-light))",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {serialLabel(booking.serial_no || idx + 1)}
          </span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "inline-flex", alignItems: "center" }}>
              {booking.customer_name}
              {booking.is_star && <StarBookingBadge />}
            </strong>
            {booking.booking_date ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                <i className="fa-solid fa-calendar-plus" style={{ marginRight: 4, color: "var(--primary)" }} />
                Booked {booking.booking_date}
                {booking.booking_time ? ` ${booking.booking_time}` : ""}
              </div>
            ) : null}
            <div style={{ fontSize: 11, color: "var(--text-muted)", wordBreak: "break-word" }}>
              Serial #{serialLabel(booking.serial_no)} · {formatInr(booking.total_rent)}
              {booking.venue ? ` · ${booking.venue}` : ""}
            </div>
            {isUnavailable && booking.reason && (
              <div style={{ fontSize: 11, color: "#fc8181", marginTop: 3 }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
                {booking.reason}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <span className={`badge ${statusBadgeClass(booking.status)}`} style={{ fontSize: 10 }}>
            {statusLabel(booking.status)}
          </span>
          <BookingCardHeaderDates d={booking} />
        </div>
      </div>

      <div className="card-body" style={{ paddingTop: 0, paddingBottom: 12 }}>
        <PackingBookingDetailsGrid
          d={booking}
          extras={{
            contact_1: booking.contact_1,
            whatsapp_no: booking.whatsapp_no,
            venue: booking.venue,
            staff_names: booking.staff_names,
            total_advance: booking.total_advance,
          }}
        />
      </div>

      <div className="card-body p-0">
        {booking.items.map((item, i) => (
          <div
            key={i}
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: "var(--cream-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              👗
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, wordBreak: "break-word" }}>
                {item.display_name || item.dress_name}{" "}
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({item.category})</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatInr(item.price)}</div>
              {item.notes && (
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--primary)", fontStyle: "italic" }}>
                  <i className="fa-solid fa-note-sticky" style={{ marginRight: 4 }} />
                  {item.notes}
                </div>
              )}
              {!isUnavailable && item.returning_warning && (
                <div style={{ marginTop: 8 }}>
                  <BookingWarningPanel w={item.returning_warning} variant="returning" />
                </div>
              )}
              {!isUnavailable && item.booked_warning && (
                <div style={{ marginTop: 8 }}>
                  <BookingWarningPanel w={item.booked_warning} variant="booked" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
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
  const [page, setPage] = useState(initialData.page || 1);
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
    (pageNum: number) => {
      const params = new URLSearchParams({
        delivery_date: from,
        return_date: to || from,
        page: String(pageNum),
      });
      if (deliveryTime) params.set("delivery_time", deliveryTime);
      if (returnTime) params.set("return_time", returnTime);
      if (category) params.set("category", category);
      return params;
    },
    [from, to, deliveryTime, returnTime, category],
  );

  const load = useCallback(
    async (pageNum = page) => {
      if (!from) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const params = buildParams(pageNum);
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
          setPage(payload.page || pageNum);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!controller.signal.aborted) {
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
    [from, to, buildParams, page],
  );

  const scheduleLoad = useCallback(
    (pageNum = 1) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setPage(pageNum);
        load(pageNum);
      }, 300);
    },
    [load],
  );

  useRealtimeRefresh(BOOKING_EVENTS, () => {
    invalidateClientCache("booking-list:");
    load(page);
  });

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    scheduleLoad(1);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [from, to, deliveryTime, returnTime, category, scheduleLoad]);

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
    const params = buildParams(1);
    params.delete("page");
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
            subtitle={`Period: ${data.from_date} to ${data.to_date}`}
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
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            <i className="fa-solid fa-info-circle" /> Shows bookings with <strong>delivery (pickup) date</strong>{" "}
            between <strong>From</strong> and <strong>To</strong> (max {data.pageSize || 50} per page). Dresses still
            out from before the period appear under <strong>Not Available</strong>.
            {loading && <span style={{ marginLeft: 8 }}>Updating…</span>}
          </p>
        </div>
      </div>

      {!empty && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 18px", fontSize: 13 }}>
            <strong>{data.totalMain}</strong> booking{data.totalMain !== 1 ? "s" : ""} in period
            {data.totalPagesMain > 1 && (
              <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                (page {data.page}/{data.totalPagesMain})
              </span>
            )}
          </div>
          {!!data.totalUnavailable && (
            <div style={{ background: "#7b2d2d33", border: "1.5px solid #e53e3e55", borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "#fc8181" }}>
              <strong>{data.totalUnavailable}</strong> not available
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
            Period: <strong>{data.from_date}</strong> to <strong>{data.to_date}</strong>
          </div>
        </div>
      )}

      {empty ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <p>No bookings found for {data.from_date} to {data.to_date}.</p>
        </div>
      ) : (
        <>
          {!!bookings.length && (
            <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>
              <i className="fa-solid fa-calendar-check" style={{ marginRight: 6 }} />
              Bookings in Period ({bookings.length} shown) — oldest delivery first
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
              <BookingCard key={entry.booking.id} booking={entry.booking} idx={entry.idx} />
            ),
          )}

          {data.totalPagesMain > 1 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 24 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1)}
              >
                Previous
              </button>
              <span style={{ fontSize: 13 }}>
                Page {page} / {data.totalPagesMain}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={page >= data.totalPagesMain || loading}
                onClick={() => load(page + 1)}
              >
                Next
              </button>
            </div>
          )}

          {!!unavailable.length && (
            <div className="card" style={{ border: "2px solid #e53e3e", marginTop: 28 }}>
              <div className="card-header" style={{ background: "#7b2d2d22" }}>
                <h3 className="card-title" style={{ color: "#fc8181", fontSize: 14 }}>
                  <i className="fa-solid fa-ban" style={{ marginRight: 8 }} />
                  Not Available During Period
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>
                    Delivered before {data.from_date}, return before {data.to_date}
                  </span>
                </h3>
              </div>
              <div style={{ padding: "12px 20px", fontSize: 12, color: "#feb2b2", background: "#7b2d2d11", borderBottom: "1px solid #e53e3e44" }}>
                These dresses were delivered before <strong>{data.from_date}</strong> and return before{" "}
                <strong>{data.to_date}</strong>. They are <strong>not available</strong> during this period.
              </div>
              {unavailable.map((b, idx) => (
                <BookingCard key={b.id} booking={b} idx={idx} isUnavailable />
              ))}
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
