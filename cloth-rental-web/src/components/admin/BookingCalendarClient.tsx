"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type CalendarEvent = {
  id: number;
  title: string;
  start: string;
  end: string;
  status: string;
  serial: number;
  customerName: string;
  dresses: string;
};

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  booked: { bg: "#1565c0", border: "#0d47a1", text: "#fff" },
  delivered: { bg: "#2e7d32", border: "#1b5e20", text: "#fff" },
  returned: { bg: "#558b2f", border: "#33691e", text: "#fff" },
  incomplete_return: { bg: "#e65100", border: "#bf360c", text: "#fff" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function statusLabel(s: string): string {
  if (s === "incomplete_return") return "Incomplete Return";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventOnDay(ev: CalendarEvent, day: Date): boolean {
  const start = parseIso(ev.start);
  const end = parseIso(ev.end);
  const t = day.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function monthMatrix(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
  return rows;
}

export default function BookingCalendarClient({ events }: { events: CalendarEvent[] }) {
  const router = useRouter();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const matrix = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div
          className="card-header"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            <i className="fa-solid fa-calendar-days" style={{ marginRight: 8 }} />
            Booking Calendar
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={prevMonth} aria-label="Previous month">
              <i className="fa-solid fa-chevron-left" />
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={goToday}>
              Today
            </button>
            <strong style={{ minWidth: 160, textAlign: "center" }}>{monthLabel}</strong>
            <button type="button" className="btn btn-outline btn-sm" onClick={nextMonth} aria-label="Next month">
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: "12px 16px 16px" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14, fontSize: 12 }}>
            {Object.entries(STATUS_COLORS).map(([status, c]) => (
              <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: c.bg, display: "inline-block" }} />
                {statusLabel(status)}
              </span>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 1,
              background: "var(--border, #e0e0e0)",
              border: "1px solid var(--border, #e0e0e0)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                style={{
                  background: "#f5f5f5",
                  padding: "8px 4px",
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {wd}
              </div>
            ))}

            {matrix.flat().map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} style={{ background: "#fafafa", minHeight: 96 }} />;
              }

              const dayEvents = events.filter((ev) => eventOnDay(ev, day));
              const isToday = sameDay(day, today);

              return (
                <div
                  key={day.toISOString()}
                  style={{
                    background: isToday ? "rgba(201,168,70,0.08)" : "#fff",
                    minHeight: 96,
                    padding: 6,
                    verticalAlign: "top",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 4,
                      color: isToday ? "var(--primary, #7b1f45)" : "inherit",
                    }}
                  >
                    {day.getDate()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {dayEvents.slice(0, 4).map((ev) => {
                      const color = STATUS_COLORS[ev.status] || STATUS_COLORS.booked;
                      return (
                        <button
                          key={`${ev.id}-${day.toISOString()}`}
                          type="button"
                          title={ev.title}
                          onClick={() => router.push(`/booking/${ev.id}`)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            borderLeft: `3px solid ${color.border}`,
                            background: color.bg,
                            color: color.text,
                            borderRadius: 4,
                            padding: "3px 6px",
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            lineHeight: 1.3,
                          }}
                        >
                          {ev.title}
                        </button>
                      );
                    })}
                    {dayEvents.length > 4 && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 }}>
                        +{dayEvents.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Click any booking block to open its detail page. Showing {events.length} active booking
        {events.length !== 1 ? "s" : ""}.
      </p>
    </div>
  );
}
