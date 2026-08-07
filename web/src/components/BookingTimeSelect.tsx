"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  times: string[];
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

/**
 * Time picker that does not auto-jump like a native <select> typeahead
 * (e.g. typing "5" no longer immediately commits to "5:00 PM").
 * Type to filter, then click / Enter to confirm.
 */
export default function BookingTimeSelect({
  value,
  onChange,
  times,
  className = "form-control",
  id,
  disabled,
  "aria-label": ariaLabel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return times;
    const compact = q.replace(/\s+/g, "");
    return times.filter((t) => {
      const lower = t.toLowerCase();
      return (
        lower.includes(q) ||
        lower.replace(/\s+/g, "").includes(compact) ||
        lower.replace(/[^0-9apm]/gi, "").includes(compact.replace(/[^0-9apm]/gi, ""))
      );
    });
  })();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commit(t: string) {
    onChange(t);
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }

  return (
    <div ref={wrapRef} className="booking-time-select" style={{ position: "relative" }}>
      <input
        id={id}
        type="text"
        className={className}
        disabled={disabled}
        aria-label={ariaLabel || "Time"}
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        inputMode="text"
        value={open ? query : value}
        placeholder={value || "Select time"}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActiveIdx(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
            setOpen(true);
            setQuery("");
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const pick = filtered[activeIdx] || filtered[0];
            if (pick) commit(pick);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <div className="booking-time-dropdown" role="listbox">
          {filtered.length === 0 ? (
            <div className="booking-time-empty">No matching time</div>
          ) : (
            filtered.map((t, idx) => (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={t === value}
                className={`booking-time-option${idx === activeIdx ? " active" : ""}${t === value ? " selected" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(t);
                }}
              >
                {t}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
