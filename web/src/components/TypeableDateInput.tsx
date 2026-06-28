"use client";

import { useEffect, useRef, useState } from "react";
import { isoToDisplay, isIsoDate, parsePartialDateEdit } from "@/lib/dateInput";

type Props = {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
};

type Segment = "day" | "month" | "year";
type Parts = { day: string; month: string; year: string };

const SEGMENTS: Segment[] = ["day", "month", "year"];
const SEGMENT_RANGE: Record<Segment, [number, number]> = {
  day: [0, 2],
  month: [3, 5],
  year: [6, 10],
};
const SEGMENT_MAX: Record<Segment, number> = { day: 2, month: 2, year: 4 };

function isoToParts(iso: string): Parts {
  const [y, m, d] = iso.split("-");
  return { day: d, month: m, year: y };
}

function partsToDisplay(p: Parts): string {
  if (!p.day && !p.month && !p.year) return "";
  const dd = p.day.padStart(2, "0").slice(0, 2);
  const mm = p.month.padStart(2, "0").slice(0, 2);
  const yy = p.year.padStart(4, "0").slice(0, 4);
  return `${dd}-${mm}-${yy}`;
}

function partsFromDisplay(text: string): Parts | null {
  const m = text.match(/^(\d{1,2})-(\d{1,2})-(\d{1,4})$/);
  if (!m) return null;
  return { day: m[1], month: m[2], year: m[3] };
}

function segmentAtPos(pos: number): Segment {
  if (pos <= 2) return "day";
  if (pos <= 5) return "month";
  return "year";
}

function nextSegment(seg: Segment): Segment {
  const i = SEGMENTS.indexOf(seg);
  return SEGMENTS[Math.min(i + 1, SEGMENTS.length - 1)];
}

function prevSegment(seg: Segment): Segment {
  const i = SEGMENTS.indexOf(seg);
  return SEGMENTS[Math.max(i - 1, 0)];
}

function selectSegment(input: HTMLInputElement, seg: Segment) {
  const [start, end] = SEGMENT_RANGE[seg];
  requestAnimationFrame(() => input.setSelectionRange(start, end));
}

export default function TypeableDateInput({
  value,
  onChange,
  min,
  className = "form-control",
  id,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const baseIsoRef = useRef<string | null>(isIsoDate(value) ? value : null);
  const partsRef = useRef<Parts>(
    isIsoDate(value) ? isoToParts(value) : { day: "", month: "", year: "" },
  );
  const activeSegment = useRef<Segment>("day");
  const replaceSegment = useRef(true);

  const [text, setText] = useState(() =>
    isIsoDate(value) ? isoToDisplay(value) : "",
  );

  useEffect(() => {
    if (!focused.current) {
      setText(isIsoDate(value) ? isoToDisplay(value) : value);
      if (isIsoDate(value)) partsRef.current = isoToParts(value);
    }
  }, [value]);

  function syncDisplay(parts: Parts) {
    partsRef.current = parts;
    setText(partsToDisplay(parts));
  }

  function commit(raw: string, revertOnInvalid = true) {
    const baseIso = isIsoDate(value) ? value : baseIsoRef.current;
    const iso = parsePartialDateEdit(raw, baseIso);
    if (!iso) {
      if (!raw.trim()) {
        onChange("");
        setText("");
        partsRef.current = { day: "", month: "", year: "" };
        return;
      }
      if (revertOnInvalid && isIsoDate(value)) {
        const display = isoToDisplay(value);
        setText(display);
        partsRef.current = isoToParts(value);
      }
      return;
    }
    let next = iso;
    if (min && next < min) next = min;
    onChange(next);
    baseIsoRef.current = next;
    partsRef.current = isoToParts(next);
    setText(isoToDisplay(next));
  }

  function applyPickerValue(next: string) {
    if (!next) return;
    let iso = next;
    if (min && iso < min) iso = min;
    onChange(iso);
    baseIsoRef.current = iso;
    partsRef.current = isoToParts(iso);
    setText(isoToDisplay(iso));
  }

  function applyDigit(digit: string) {
    const seg = activeSegment.current;
    const max = SEGMENT_MAX[seg];
    const parts = { ...partsRef.current };
    let val = parts[seg];

    if (replaceSegment.current) {
      val = digit;
      replaceSegment.current = false;
    } else if (val.length >= max) {
      val = digit;
    } else {
      val = val + digit;
    }

    parts[seg] = val.slice(0, max);
    syncDisplay(parts);

    const el = inputRef.current;
    if (el) selectSegment(el, seg);

    if (parts[seg].length >= max && seg !== "year") {
      activeSegment.current = nextSegment(seg);
      replaceSegment.current = true;
      if (el) selectSegment(el, activeSegment.current);
    }
  }

  function applyBackspace() {
    const seg = activeSegment.current;
    const parts = { ...partsRef.current };
    if (parts[seg].length > 0) {
      parts[seg] = parts[seg].slice(0, -1);
      replaceSegment.current = false;
    } else {
      const prev = prevSegment(seg);
      activeSegment.current = prev;
      replaceSegment.current = true;
    }
    syncDisplay(parts);
    const el = inputRef.current;
    if (el) selectSegment(el, activeSegment.current);
  }

  function handlePaste(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (!digits) return;
    const parts: Parts = {
      day: digits.slice(0, 2),
      month: digits.slice(2, 4),
      year: digits.slice(4, 8),
    };
    syncDisplay(parts);
    activeSegment.current = digits.length <= 2 ? "day" : digits.length <= 4 ? "month" : "year";
    replaceSegment.current = true;
    const el = inputRef.current;
    if (el) selectSegment(el, activeSegment.current);
  }

  return (
    <div className="typeable-date-input" data-preserve-case>
      <input
        ref={inputRef}
        type="text"
        id={id}
        className={`${className} preserve-case`.trim()}
        inputMode="numeric"
        placeholder="DD-MM-YYYY"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={text}
        disabled={disabled}
        onFocus={() => {
          focused.current = true;
          baseIsoRef.current = isIsoDate(value) ? value : baseIsoRef.current;
          if (isIsoDate(value)) {
            partsRef.current = isoToParts(value);
            setText(isoToDisplay(value));
          } else {
            const parsed = partsFromDisplay(text);
            if (parsed) partsRef.current = parsed;
          }
          activeSegment.current = "day";
          replaceSegment.current = true;
          const el = inputRef.current;
          if (el) selectSegment(el, "day");
        }}
        onClick={(e) => {
          const el = e.currentTarget;
          const pos = el.selectionStart ?? 0;
          activeSegment.current = segmentAtPos(pos);
          replaceSegment.current = true;
          selectSegment(el, activeSegment.current);
        }}
        onBeforeInput={(e) => {
          const ne = e.nativeEvent as InputEvent;
          if (ne.inputType === "insertText" && ne.data && /^\d$/.test(ne.data)) {
            e.preventDefault();
            applyDigit(ne.data);
          }
        }}
        onChange={() => {
          /* digits handled via onKeyDown / onBeforeInput */
        }}
        onKeyDown={(e) => {
          if (e.key >= "0" && e.key <= "9") {
            e.preventDefault();
            applyDigit(e.key);
            return;
          }
          if (e.key === "Backspace") {
            e.preventDefault();
            applyBackspace();
            return;
          }
          if (e.key === "Delete") {
            e.preventDefault();
            const seg = activeSegment.current;
            const parts = { ...partsRef.current, [seg]: "" };
            replaceSegment.current = true;
            syncDisplay(parts);
            if (inputRef.current) selectSegment(inputRef.current, seg);
            return;
          }
          if (e.key === "ArrowRight" || e.key === "-") {
            e.preventDefault();
            activeSegment.current = nextSegment(activeSegment.current);
            replaceSegment.current = true;
            if (inputRef.current) selectSegment(inputRef.current, activeSegment.current);
            return;
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            activeSegment.current = prevSegment(activeSegment.current);
            replaceSegment.current = true;
            if (inputRef.current) selectSegment(inputRef.current, activeSegment.current);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
            return;
          }
          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            activeSegment.current = nextSegment(activeSegment.current);
            replaceSegment.current = true;
            if (inputRef.current) selectSegment(inputRef.current, activeSegment.current);
            return;
          }
          if (e.key === "Tab" && e.shiftKey) {
            e.preventDefault();
            activeSegment.current = prevSegment(activeSegment.current);
            replaceSegment.current = true;
            if (inputRef.current) selectSegment(inputRef.current, activeSegment.current);
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          handlePaste(e.clipboardData.getData("text"));
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
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
