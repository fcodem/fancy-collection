"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BookingWarningPanel,
  PackingBookingDetailsGrid,
} from "@/components/BookingDetailsColumns";
import type { BookingWarningRecord } from "@/lib/bookingDetails";
import { photoUrl } from "@/lib/photoUrl";
import { formatInr } from "@/lib/format";

const TIME_SLOTS = [
  "9:00 AM", "10:00 AM", "11:00 AM", "12:00 Noon", "1:00 PM", "2:00 PM",
  "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM",
  "9:00 PM", "10:00 PM",
];

type ItemRow = {
  dress_name: string;
  display_name: string;
  category: string;
  price: number;
  notes: string;
  photo: string;
  returning_warning: BookingWarningRecord | null;
  booked_warning: BookingWarningRecord | null;
};

type BookingRow = {
  id: number;
  serial_no: number;
  customer_name: string;
  customer_address: string;
  contact_1: string;
  whatsapp_no: string;
  venue: string;
  staff_names: string;
  total_advance: number;
  total_rent: number;
  security_deposit: number;
  dress_names: string;
  item_notes: string;
  common_notes: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  return_time: string;
  items: ItemRow[];
  reason?: string;
};

type ListData = {
  bookings: BookingRow[];
  unavailable: BookingRow[];
  from_date: string;
  to_date: string;
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
            <strong>{booking.customer_name}</strong>
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
        <div className="booking-card-header-dates">
          <div>
            <i className="fa-solid fa-truck" style={{ marginRight: 4, color: "var(--primary)" }} />
            {booking.delivery_date} {booking.delivery_time}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            <i className="fa-solid fa-rotate-left" style={{ marginRight: 4 }} />
            {booking.return_date} {booking.return_time}
          </div>
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
            {item.photo ? (
              <img
                src={photoUrl(item.photo)}
                alt=""
                style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
              />
            ) : (
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
                }}
              >
                👗
              </div>
            )}
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

export default function BookingListClient({
  initialFrom,
  initialTo,
  initialData,
  categories,
}: {
  initialFrom: string;
  initialTo: string;
  initialData: ListData;
  categories: Categories;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [deliveryTime, setDeliveryTime] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<ListData>(initialData);
  const [loading, setLoading] = useState(false);
  const skipFirst = useRef(true);

  const load = useCallback(async () => {
    if (!from) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ delivery_date: from, return_date: to || from });
      if (deliveryTime) params.set("delivery_time", deliveryTime);
      if (returnTime) params.set("return_time", returnTime);
      if (category) params.set("category", category);
      const res = await fetch(`/api/booking-list?${params}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      setData({ bookings: [], unavailable: [], from_date: from, to_date: to || from });
    } finally {
      setLoading(false);
    }
  }, [from, to, deliveryTime, returnTime, category]);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    load();
  }, [load]);

  const { bookings, unavailable } = data;
  const empty = !bookings.length && !unavailable.length;

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-list-check" style={{ marginRight: 8 }} />
            Filter Booked Items
          </h3>
          <button type="button" onClick={() => window.print()} className="btn btn-outline btn-sm no-print">
            <i className="fa-solid fa-print" /> Print
          </button>
        </div>
        <div className="card-body">
          <div className="filter-grid-5" style={{ marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>From Date</label>
              <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
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
              <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All Categories</option>
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
              </select>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            <i className="fa-solid fa-info-circle" /> Shows all bookings with <strong>delivery (pickup) date</strong>{" "}
            between <strong>From</strong> and <strong>To</strong> (both dates included). Dresses delivered before the
            From date that are still out during the period appear under <strong>Not Available</strong>.
            {loading && <span style={{ marginLeft: 8 }}>Updating…</span>}
          </p>
        </div>
      </div>

      {!empty && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 18px", fontSize: 13 }}>
            <strong>{bookings.length}</strong> booking{bookings.length !== 1 ? "s" : ""} in period
          </div>
          {!!unavailable.length && (
            <div style={{ background: "#7b2d2d33", border: "1.5px solid #e53e3e55", borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "#fc8181" }}>
              <strong>{unavailable.length}</strong> dress{unavailable.length !== 1 ? "es" : ""} not available
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "10px 0" }}>
            Period: <strong>{data.from_date}</strong> to <strong>{data.to_date}</strong> (inclusive)
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
              Bookings in Period ({bookings.length})
            </div>
          )}
          {bookings.map((b, idx) => (
            <BookingCard key={b.id} booking={b} idx={idx} />
          ))}

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
