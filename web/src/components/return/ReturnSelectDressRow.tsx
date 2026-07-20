"use client";

import { memo } from "react";
import BookingItemWarningsBlock from "@/components/BookingItemWarningsSection";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";
import { bookingPhotoUrl } from "@/lib/photoUrl";

export type ReturnSelectDress = {
  id: number;
  dressName: string;
  category?: string | null;
  size?: string;
  photo?: string;
};

type ReturnSelectDressRowProps = {
  row: ReturnSelectDress;
  selected: boolean;
  itemWarnings?: ItemWarningSource;
  onToggleSelect: (id: number, selected: boolean) => void;
};

function ReturnSelectDressRow({
  row,
  selected,
  itemWarnings,
  onToggleSelect,
}: ReturnSelectDressRowProps) {
  return (
    <div
      style={{
        marginBottom: 10,
        padding: "12px 14px",
        border: `1px solid ${selected ? "#2e7d32" : "var(--border)"}`,
        borderRadius: 10,
        background: selected ? "rgba(46,125,50,0.06)" : "var(--cream-dark, #fafafa)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelect(row.id, e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>Return</span>
        </label>
        {row.photo && (
          <img
            src={bookingPhotoUrl(row.photo)}
            alt=""
            style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
          />
        )}
        <div style={{ flex: 1, minWidth: 140 }}>
          <strong>{row.dressName}</strong>
          {(row.category || row.size) && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {[row.category, row.size].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>
      {itemWarnings && <BookingItemWarningsBlock item={itemWarnings} />}
    </div>
  );
}

export default memo(ReturnSelectDressRow);
