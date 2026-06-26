"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";

type DayBooking = {
  id: number;
  serial: number;
  customer: string;
  phone: string;
  whatsapp: string;
  status: string;
  deliveryTime: string;
  dressCount: number;
};

type CalendarDayEvent = {
  id: string;
  title: string;
  start: string;
  count: number;
  bookings: DayBooking[];
  advanceDisplay: string;
  priceDisplay: string;
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  booked: { bg: "#1565c0", border: "#0d47a1", text: "#fff" },
  delivered: { bg: "#2e7d32", border: "#1b5e20", text: "#fff" },
  returned: { bg: "#78909c", border: "#546e7a", text: "#fff" },
  incomplete_return: { bg: "#e65100", border: "#bf360c", text: "#fff" },
};

function statusLabel(s: string): string {
  if (s === "incomplete_return") return "INCOMPLETE RETURN";
  return s.toUpperCase();
}

function statusBadge(s: string): string {
  if (s === "booked") return "badge-info";
  if (s === "delivered") return "badge-success";
  if (s === "returned") return "badge-secondary";
  return "badge-warning";
}

export default function BookingCalendarClient() {
  const [events, setEvents] = useState<CalendarDayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalendarDayEvent | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/calendar-events", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const calendarEvents = events.map((e) => {
    const dominant =
      e.bookings.find((b) => b.status === "booked")?.status ||
      e.bookings[0]?.status ||
      "booked";
    const color = STATUS_COLORS[dominant] || STATUS_COLORS.booked;
    return {
      id: e.id,
      title: e.title,
      start: e.start,
      allDay: true,
      backgroundColor: color.bg,
      borderColor: color.border,
      textColor: color.text,
      extendedProps: e,
    };
  });

  const handleEventClick = useCallback((info: EventClickArg) => {
    const evt = info.event.extendedProps as CalendarDayEvent;
    setSelected(evt);
  }, []);

  function closeModal() {
    setSelected(null);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    if (selected) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selected]);

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            <i className="fa-solid fa-calendar-days" style={{ marginRight: 8 }} />
            Booking Calendar
          </h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
            {Object.entries(STATUS_COLORS).map(([status, c]) => (
              <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, display: "inline-block" }} />
                {statusLabel(status)}
              </span>
            ))}
          </div>
        </div>
        <div className="card-body" style={{ padding: "12px 16px" }}>
          {loading ? (
            <p style={{ color: "var(--text-muted)", padding: 40, textAlign: "center" }}>Loading calendar…</p>
          ) : (
            <div className="fc-wrapper">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={calendarEvents}
                eventClick={handleEventClick}
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,dayGridWeek",
                }}
                height="auto"
                dayMaxEvents={6}
                eventDisplay="block"
                firstDay={1}
                fixedWeekCount={false}
              />
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.45)",
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            ref={modalRef}
            style={{
              background: "#fff",
              borderRadius: 16,
              maxWidth: 520,
              width: "100%",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{
              padding: "20px 24px 16px",
              background: "linear-gradient(135deg, var(--primary-dark), var(--primary))",
              color: "#fff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {selected.start}
                </div>
                <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>
                  {selected.count} {selected.count === 1 ? "booking" : "bookings"} scheduled for delivery
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div style={{ padding: "20px 24px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, textAlign: "center" }}>
                <div style={{ padding: "12px", background: "#f5f5f5", borderRadius: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.priceDisplay}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total booking value</div>
                </div>
                <div style={{ padding: "12px", background: "rgba(46,125,50,0.08)", borderRadius: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--success)" }}>{selected.advanceDisplay}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total advance</div>
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Time</th>
                    <th>Dresses</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.bookings.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{String(b.serial).padStart(2, "0")}</strong></td>
                      <td>
                        <div><strong>{b.customer}</strong></div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {b.phone}
                          {b.whatsapp && b.whatsapp !== b.phone && (
                            <span style={{ marginLeft: 8 }}>WA: {b.whatsapp}</span>
                          )}
                        </div>
                      </td>
                      <td>{b.deliveryTime}</td>
                      <td>{b.dressCount}</td>
                      <td><span className={`badge ${statusBadge(b.status)}`}>{statusLabel(b.status)}</span></td>
                      <td>
                        <a href={`/booking/${b.id}`} className="btn btn-sm btn-outline">View</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .fc-wrapper .fc {
          font-family: inherit;
          --fc-border-color: var(--border, #e0e0e0);
          --fc-today-bg-color: rgba(201,168,70,0.08);
        }
        .fc-wrapper .fc .fc-toolbar-title {
          font-size: 18px;
          font-weight: 800;
        }
        .fc-wrapper .fc .fc-button {
          border-radius: 8px;
          font-weight: 600;
          text-transform: capitalize;
          font-size: 13px;
          padding: 6px 14px;
          border: 1px solid var(--border, #ccc);
          background: #fff;
          color: var(--text-dark, #333);
          box-shadow: none;
        }
        .fc-wrapper .fc .fc-button:hover {
          background: #f5f5f5;
        }
        .fc-wrapper .fc .fc-button-active,
        .fc-wrapper .fc .fc-button.fc-button-active {
          background: var(--primary, #7b1f45) !important;
          color: #fff !important;
          border-color: var(--primary, #7b1f45) !important;
        }
        .fc-wrapper .fc .fc-daygrid-event {
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: none;
          line-height: 1.4;
          text-align: center;
        }
        .fc-wrapper .fc .fc-daygrid-day-number {
          font-weight: 700;
          font-size: 13px;
          padding: 6px 10px;
        }
        .fc-wrapper .fc .fc-col-header-cell-cushion {
          font-weight: 700;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 8px 4px;
        }
        .fc-wrapper .fc .fc-more-link {
          font-weight: 700;
          font-size: 11px;
          color: var(--primary, #7b1f45);
        }
      `}</style>
    </div>
  );
}
