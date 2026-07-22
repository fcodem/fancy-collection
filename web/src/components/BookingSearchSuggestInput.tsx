"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SuggestItem = {
  id: number;
  serial: number;
  label: string;
  meta: string;
  customer_name: string;
  delivery_date?: string;
  return_date?: string;
  delivery_time?: string;
  return_time?: string;
};

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onSelect"> & {
  searchDate?: string;
  mode?: "delivery" | "return" | "postponed";
  onSuggestSelect?: (item: SuggestItem) => void;
};

export default function BookingSearchSuggestInput({
  searchDate = "",
  mode = "delivery",
  onSuggestSelect,
  className = "",
  value,
  onChange,
  ...props
}: Props) {
  const [items, setItems] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressUntil = useRef(0);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (Date.now() < suppressUntil.current || q.length < 1) {
      setItems([]);
      setOpen(false);
      return;
    }
    const params = new URLSearchParams({ q, mode });
    if (searchDate) params.set("date", searchDate);
    const res = await fetch(`/api/booking/suggest?${params}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    setItems(list);
    setOpen(list.length > 0);
    setActiveIdx(-1);
  }, [searchDate, mode]);

  useEffect(() => {
    const q = String(value || "").trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(q), 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, fetchSuggestions]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function selectItem(item: SuggestItem) {
    suppressUntil.current = Date.now() + 600;
    onChange?.({ target: { value: String(item.serial) } } as React.ChangeEvent<HTMLInputElement>);
    onSuggestSelect?.(item);
    setOpen(false);
    setItems([]);
  }

  return (
    <div ref={wrapRef} className="dress-suggest-wrap" data-preserve-case style={{ position: "relative", zIndex: open ? 50 : undefined }}>
      <input
        {...props}
        value={value}
        onChange={onChange}
        autoComplete="off"
        className={`form-control preserve-case booking-search-input ${className}`.trim()}
        onFocus={() => { if (String(value || "").trim()) fetchSuggestions(String(value)); }}
        onKeyDown={(e) => {
          if (open && items.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); selectItem(items[activeIdx]); return; }
            if (e.key === "Escape") { setOpen(false); return; }
          }
          props.onKeyDown?.(e);
        }}
      />
      {open && items.length > 0 && (
        <div
          className="dress-suggest-dropdown"
          style={{ display: "block", position: "absolute", zIndex: 9999 }}
        >
          {items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={`dress-suggest-item${idx === activeIdx ? " active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  width: "100%",
                }}
              >
                <span className="dress-suggest-name">{item.label}</span>
                {(item.delivery_date || item.return_date) && (
                  <span
                    className="dress-suggest-dates"
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textAlign: "right",
                      lineHeight: 1.35,
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ display: "block", whiteSpace: "nowrap" }}>
                      <i className="fa-solid fa-truck" style={{ marginRight: 4, fontSize: 10 }} />
                      {item.delivery_date}
                      {item.delivery_time ? ` ${item.delivery_time}` : ""}
                    </span>
                    <span style={{ display: "block", whiteSpace: "nowrap" }}>
                      <i className="fa-solid fa-rotate-left" style={{ marginRight: 4, fontSize: 10 }} />
                      {item.return_date}
                      {item.return_time ? ` ${item.return_time}` : ""}
                    </span>
                  </span>
                )}
              </div>
              {item.meta && <span className="dress-suggest-meta">{item.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
