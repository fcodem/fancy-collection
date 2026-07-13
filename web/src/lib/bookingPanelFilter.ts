export const BOOKING_PANEL_MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

export function bookingPanelDateRange(
  year: number,
  month: number | null,
): { from: string; to: string; label: string } {
  if (month && month >= 1 && month <= 12) {
    const mm = String(month).padStart(2, "0");
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthName = BOOKING_PANEL_MONTHS[month - 1]?.label ?? mm;
    return {
      from: `${year}-${mm}-01`,
      to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
      label: `${monthName} ${year}`,
    };
  }
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    label: String(year),
  };
}

export function parseBookingPanelFilters(
  searchParams: { year?: string; month?: string },
  currentYear: number,
  currentMonth = new Date().getUTCMonth() + 1,
): { year: number; month: number | null } {
  const filterYear = searchParams.year ? parseInt(searchParams.year, 10) : currentYear;
  const year = Number.isFinite(filterYear) ? filterYear : currentYear;
  const raw = searchParams.month;

  // Explicit "all" = full year; missing param = current month (fast default).
  if (raw === "all") return { year, month: null };
  if (raw != null && raw !== "") {
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= 12) return { year, month: n };
  }
  return { year, month: currentMonth >= 1 && currentMonth <= 12 ? currentMonth : 1 };
}
