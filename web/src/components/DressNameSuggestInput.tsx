"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "@/lib/bookingQrClient";
import { catalogPhotoUrl } from "@/lib/catalogPhotoUrl";

type SuggestItem = {
  id?: number;
  name: string;
  display_name?: string;
  sku?: string;
  category?: string;
  size?: string;
  photo?: string;
};

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onSelect"> & {
  /** CSS selector for linked category dropdown, e.g. "#categoryFilter" */
  categorySelect?: string;
  /** Static category filter (used when category is controlled in React) */
  category?: string;
  /** Restrict suggestions to a specific inventory item type (e.g. "jewellery") */
  itemType?: string;
  onSuggestSelect?: (item: SuggestItem) => void;
  minChars?: number;
  /** Show dress photo thumbnails in the suggestion dropdown */
  showPhotos?: boolean;
  /** Set false to disable inventory dress suggestions (e.g. mixed booking search fields) */
  suggestions?: boolean;
};

export default function DressNameSuggestInput({
  categorySelect,
  category,
  itemType,
  onSuggestSelect,
  minChars = 1,
  showPhotos = false,
  suggestions = true,
  className = "",
  autoComplete = "off",
  value,
  onChange,
  ...props
}: Props) {
  const skip =
    suggestions === false ||
    !!props["data-skip-dress-suggest" as keyof typeof props];

  const [items, setItems] = useState<SuggestItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const suppressUntilRef = useRef(0);
  const categoryRef = useRef(category);
  const itemTypeRef = useRef(itemType);
  const valueRef = useRef(value);

  categoryRef.current = category;
  itemTypeRef.current = itemType;
  valueRef.current = value;

  const closeSuggestions = useCallback(() => {
    setOpen(false);
    setItems([]);
    setActiveIdx(-1);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (Date.now() < suppressUntilRef.current || q.length < minChars) {
      closeSuggestions();
      return;
    }

    const cat =
      categoryRef.current ||
      (categorySelect ? (document.querySelector(categorySelect) as HTMLSelectElement | null)?.value : "") ||
      "";

    const params = new URLSearchParams({ q, limit: "12" });
    if (cat) params.set("category", cat);
    if (itemTypeRef.current) params.set("item_type", itemTypeRef.current);

    try {
      suggestAbortRef.current?.abort();
      const controller = new AbortController();
      suggestAbortRef.current = controller;

      const res = await fetch(`/api/dress-name/suggest?${params}`, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!res.ok) {
        closeSuggestions();
        return;
      }
      const data = await res.json();
      if (controller.signal.aborted) return;
      const list = (Array.isArray(data) ? data : []) as SuggestItem[];
      setItems(list);
      setOpen(list.length > 0);
      setActiveIdx(-1);
    } catch (e) {
      if (isAbortError(e)) return;
      closeSuggestions();
    }
  }, [categorySelect, closeSuggestions, minChars]);

  useEffect(() => () => suggestAbortRef.current?.abort(), []);

  useEffect(() => {
    if (skip) return;
    const q = String(value || "").trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void fetchSuggestions(q), 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, fetchSuggestions, skip]);

  useEffect(() => {
    if (skip) return;
    const q = String(valueRef.current || "").trim();
    if (q.length >= minChars) void fetchSuggestions(q);
  }, [category, fetchSuggestions, minChars, skip]);

  useEffect(() => {
    if (skip) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closeSuggestions();
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [skip, closeSuggestions]);

  function selectItem(item: SuggestItem) {
    suppressUntilRef.current = Date.now() + 400;
    onChange?.({
      target: { value: item.name, name: props.name },
    } as React.ChangeEvent<HTMLInputElement>);
    onSuggestSelect?.(item);
    closeSuggestions();
  }

  const inputCls = `form-control ${className}`.trim();

  if (skip) {
    return (
      <input
        {...props}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={inputCls}
      />
    );
  }

  return (
    <div
      ref={wrapRef}
      className="dress-suggest-wrap"
      style={{ position: "relative", zIndex: open ? 50 : undefined }}
    >
      <input
        {...props}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={inputCls}
        onFocus={(e) => {
          const q = String(value || "").trim();
          if (q.length >= minChars) void fetchSuggestions(q);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          // Delay so mousedown on suggestion can fire first
          setTimeout(() => closeSuggestions(), 150);
          props.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (open && items.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, items.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" && activeIdx >= 0) {
              e.preventDefault();
              selectItem(items[activeIdx]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              closeSuggestions();
              return;
            }
          }
          props.onKeyDown?.(e);
        }}
      />
      {open && items.length > 0 && (
        <div
          className="dress-suggest-dropdown"
          style={{ display: "block", position: "absolute", zIndex: 9999 }}
        >
          {items.map((item, idx) => {
            const meta = [item.category, item.size ? `Size ${item.size}` : "", item.sku]
              .filter(Boolean)
              .join(" · ");
            const thumb = showPhotos ? catalogPhotoUrl(item) : "";
            return (
              <button
                key={`${item.id ?? item.name}-${item.sku || idx}`}
                type="button"
                className={`dress-suggest-item${idx === activeIdx ? " active" : ""}`}
                style={showPhotos ? { display: "flex", alignItems: "center", gap: 10, textAlign: "left" } : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(item);
                }}
              >
                {showPhotos && (
                  thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: "cover",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        fontSize: 18,
                      }}
                    >
                      👔
                    </span>
                  )
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="dress-suggest-name">{item.display_name || item.name}</span>
                  {meta && <span className="dress-suggest-meta">{meta}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
