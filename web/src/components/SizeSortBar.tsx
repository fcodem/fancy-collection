"use client";

import { useEffect, useState } from "react";
import { BASE_MENS } from "@/lib/constants";
import { packingDivisionFilterValue } from "@/lib/packingDivision";
import { fetchCategoryLists } from "@/components/CategorySelect";

/** True when `category` is a men's category (built-in or owner-added) or the whole Mens division. */
export function useIsMensCategory(category: string): boolean {
  const [mens, setMens] = useState<string[]>(BASE_MENS);
  useEffect(() => {
    let cancelled = false;
    fetchCategoryLists()
      .then((c) => {
        if (!cancelled && c.mens_categories?.length) setMens(c.mens_categories);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const value = (category || "").trim();
  if (!value) return false;
  if (value === packingDivisionFilterValue("mens")) return true;
  const lower = value.toLowerCase();
  return mens.some((c) => c.toLowerCase() === lower);
}

export default function SizeSortBar({
  sizes,
  selected,
  onSelect,
  sortOn,
  onToggleSort,
  disabled,
}: {
  sizes: string[];
  selected: string;
  onSelect: (size: string) => void;
  sortOn: boolean;
  onToggleSort: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          marginBottom: 8,
          display: "block",
        }}
      >
        Size
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className={sortOn ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
          aria-pressed={sortOn}
          disabled={disabled}
          onClick={onToggleSort}
          title="Order bookings from smallest to largest size"
        >
          <i className="fa-solid fa-arrow-up-1-9" style={{ marginRight: 6 }} />
          Sort by size
        </button>
        <button
          type="button"
          className={!selected ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
          aria-pressed={!selected}
          disabled={disabled}
          onClick={() => onSelect("")}
        >
          All sizes
        </button>
        {sizes.map((s) => (
          <button
            key={s}
            type="button"
            className={selected === s ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            aria-pressed={selected === s}
            disabled={disabled}
            onClick={() => onSelect(selected === s ? "" : s)}
            style={{ minWidth: 48 }}
          >
            {s}
          </button>
        ))}
        {!sizes.length ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No sizes in this list</span>
        ) : null}
      </div>
    </div>
  );
}
