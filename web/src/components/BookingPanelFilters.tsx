"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { BOOKING_PANEL_MONTHS } from "@/lib/bookingPanelFilter";

export default function BookingPanelFilters({
  year,
  month,
  yearOptions,
}: {
  year: number;
  month: number | null;
  yearOptions: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (nextYear: number, nextMonth: string) => {
      const params = new URLSearchParams();
      params.set("year", String(nextYear));
      if (nextMonth) params.set("month", nextMonth);
      startTransition(() => {
        router.push(`/booking?${params.toString()}`);
      });
    },
    [router],
  );

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-end",
        marginBottom: 16,
      }}
    >
      <div>
        <label className="form-label" style={{ marginBottom: 4, fontSize: 12 }}>
          Month <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
        </label>
        <select
          className="form-control"
          style={{ minWidth: 150 }}
          value={month ?? ""}
          disabled={pending}
          onChange={(e) => apply(year, e.target.value)}
        >
          <option value="">All months</option>
          {BOOKING_PANEL_MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="form-label" style={{ marginBottom: 4, fontSize: 12 }}>
          Year
        </label>
        <select
          className="form-control"
          style={{ minWidth: 110 }}
          value={String(year)}
          disabled={pending}
          onChange={(e) => apply(Number(e.target.value), month ? String(month) : "")}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {pending && (
        <span style={{ fontSize: 12, color: "var(--text-muted)", paddingBottom: 8 }}>
          <i className="fa-solid fa-spinner fa-spin" /> Loading…
        </span>
      )}
    </div>
  );
}
