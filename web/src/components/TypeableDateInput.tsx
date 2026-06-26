"use client";

import { useEffect, useRef, useState } from "react";
import { isoToDisplay, isIsoDate, parseTypedDateToIso, formatPartialDateInput } from "@/lib/dateInput";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
};

export default function TypeableDateInput({
  value,
  onChange,
  min,
  className = "form-control",
  id,
  disabled,
}: Props) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const focused = useRef(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) {
      setText(isIsoDate(value) ? isoToDisplay(value) : value);
    }
  }, [value]);

  function commit(raw: string, revertOnInvalid = true) {
    const iso = parseTypedDateToIso(raw);
    if (!iso) {
      if (!raw.trim()) {
        onChange("");
        setText("");
        return;
      }
      if (revertOnInvalid) {
        setText(isIsoDate(value) ? isoToDisplay(value) : "");
      }
      return;
    }
    let next = iso;
    if (min && next < min) next = min;
    onChange(next);
    setText(isoToDisplay(next));
  }

  function applyPickerValue(next: string) {
    if (!next) return;
    let iso = next;
    if (min && iso < min) iso = min;
    onChange(iso);
    setText(isoToDisplay(iso));
  }

  return (
    <div className="typeable-date-input">
      <input
        type="text"
        id={id}
        className={className}
        inputMode="numeric"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        value={text}
        disabled={disabled}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(formatPartialDateInput(e.target.value))}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className="typeable-date-input__picker-btn"
        disabled={disabled}
        tabIndex={-1}
        aria-label="Open calendar"
        onClick={() => {
          const el = pickerRef.current;
          if (el && typeof el.showPicker === "function") el.showPicker();
          else el?.focus();
        }}
      >
        <i className="fa-regular fa-calendar" aria-hidden />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="typeable-date-input__native"
        tabIndex={-1}
        aria-hidden
        value={isIsoDate(value) ? value : ""}
        min={min}
        disabled={disabled}
        onChange={(e) => applyPickerValue(e.target.value)}
      />
    </div>
  );
}
