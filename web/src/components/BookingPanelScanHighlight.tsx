"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { qrScanShowsStatusBanner } from "@/lib/bookingQrClient";

const HIGHLIGHT_MS = 8000;

type Props = {
  scanId: number;
  status: string;
  serialNo: number;
  customerName: string;
  inTable: boolean;
};

function statusBannerStyle(status: string): CSSProperties {
  switch (status) {
    case "delivered":
      return { background: "rgba(46,125,50,0.14)", borderColor: "rgba(46,125,50,0.45)", color: "#1b5e20" };
    case "postponed":
      return { background: "rgba(230,126,34,0.14)", borderColor: "rgba(230,126,34,0.45)", color: "#c0392b" };
    case "cancelled":
      return { background: "rgba(192,57,43,0.12)", borderColor: "rgba(192,57,43,0.45)", color: "#922b21" };
    default:
      return { background: "rgba(192,57,43,0.08)", borderColor: "var(--border-color)", color: "var(--text)" };
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").toUpperCase();
}

/** Scroll to scanned booking row and show status banner when applicable. */
export default function BookingPanelScanHighlight({
  scanId,
  status,
  serialNo,
  customerName,
  inTable,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clearedRef = useRef(false);

  useEffect(() => {
    const row = document.querySelector<HTMLElement>(`tr[data-booking-id="${scanId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("booking-panel-row--scan-highlight");
      const timer = window.setTimeout(() => {
        row.classList.remove("booking-panel-row--scan-highlight");
      }, HIGHLIGHT_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [scanId, inTable]);

  useEffect(() => {
    if (clearedRef.current) return undefined;
    const timer = window.setTimeout(() => {
      clearedRef.current = true;
      const next = new URLSearchParams(searchParams.toString());
      next.delete("scan");
      const qs = next.toString();
      router.replace(qs ? `/booking?${qs}` : "/booking", { scroll: false });
    }, HIGHLIGHT_MS + 500);
    return () => window.clearTimeout(timer);
  }, [router, searchParams]);

  if (!qrScanShowsStatusBanner(status)) return null;

  return (
    <div
      role="status"
      className="booking-panel-scan-banner"
      style={{
        ...statusBannerStyle(status),
        border: "2px solid",
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 16,
        fontWeight: 700,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <i className="fa-solid fa-qrcode" aria-hidden />
      <span>
        Scanned booking #{String(serialNo).padStart(2, "0")} — {customerName}
      </span>
      <span
        className={`badge badge-${status}`}
        style={{ fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" }}
      >
        {statusLabel(status)}
      </span>
    </div>
  );
}
