"use client";

import dynamic from "next/dynamic";

const BookingCalendarClient = dynamic(() => import("@/components/BookingCalendarClient"), {
  ssr: false,
  loading: () => <div style={{ padding: "2rem", color: "var(--bs-secondary)" }}>Loading calendar…</div>,
});

export default function BookingCalendarLoader() {
  return <BookingCalendarClient />;
}
