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
  /** When true, clear the input after picking a suggestion (caller still receives the item). */
  clearOnSelect?: boolean;
  /** Open a larger preview when a suggestion photo is tapped. */
  onPhotoZoom?: (src: string, caption?: string) => void;
  /** Optional ref to the underlying input (for USB scanner refocus). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export default function DressNameSuggestInput({
  categorySelect,
  category,
  itemType,
  onSuggestSelect,
  minChars = 1,
  showPhotos = false,
  suggestions = true,
  clearOnSelect = false,
  onPhotoZoom,
  inputRef: externalInputRef,
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
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
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
    setCanScrollUp(false);
    setCanScrollDown(false);
  }, []);

  const updateScrollButtons = useCallback(() => {
    const el = listRef.current;
    if (!el) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }
    const max = el.scrollHeight - el.clientHeight;
    setCanScrollUp(el.scrollTop > 4);
    setCanScrollDown(max > 4 && el.scrollTop < max - 4);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    // Digit-only queries are treated as SKU/serial filters — no dropdown remount needed.
    if (
      Date.now() < suppressUntilRef.current ||
      q.length < minChars ||
      /^\d+$/.test(q)
    ) {
      closeSuggestions();
      return;
    }

    const cat =
      categoryRef.current ||
      (categorySelect ? (document.querySelector(categorySelect) as HTMLSelectElement | null)?.value : "") ||
      "";

    const params = new URLSearchParams({ q, limit: "48" });
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
      requestAnimationFrame(() => updateScrollButtons());
    } catch (e) {
      if (isAbortError(e)) return;
      closeSuggestions();
    }
  }, [categorySelect, closeSuggestions, minChars, updateScrollButtons]);

  useEffect(() => () => suggestAbortRef.current?.abort(), []);

  useEffect(() => {
    if (skip) {
      closeSuggestions();
      return;
    }
    const q = String(value || "").trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void fetchSuggestions(q), 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, fetchSuggestions, skip, closeSuggestions]);

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

  useEffect(() => {
    if (!open || !items.length) return;
    const id = requestAnimationFrame(() => updateScrollButtons());
    return () => cancelAnimationFrame(id);
  }, [open, items, updateScrollButtons]);

  function selectItem(item: SuggestItem) {
    suppressUntilRef.current = Date.now() + 400;
    onChange?.({
      target: { value: clearOnSelect ? "" : item.name, name: props.name },
    } as React.ChangeEvent<HTMLInputElement>);
    onSuggestSelect?.(item);
    closeSuggestions();
    inputRef.current?.focus({ preventScroll: true });
  }

  function scrollList(dir: "up" | "down") {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ top: dir === "down" ? 180 : -180, behavior: "smooth" });
    setTimeout(updateScrollButtons, 180);
  }

  const inputCls = `form-control ${className}`.trim();

  // Always keep the same DOM tree so enabling/disabling suggestions never remounts
  // the <input> (that was stealing focus after the first typed character).
  return (
    <div
      ref={wrapRef}
      className="dress-suggest-wrap"
      style={{ position: "relative", zIndex: open ? 50 : undefined }}
    >
      <input
        {...props}
        ref={(el) => {
          inputRef.current = el;
          if (externalInputRef) externalInputRef.current = el;
        }}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={inputCls}
        onFocus={(e) => {
          if (!skip) {
            const q = String(value || "").trim();
            if (q.length >= minChars) void fetchSuggestions(q);
          }
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          // Delay so mousedown on suggestion can fire first
          setTimeout(() => closeSuggestions(), 150);
          props.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (!skip && open && items.length) {
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
      {!skip && open && items.length > 0 && (
        <div className="dress-suggest-panel" style={{ display: "block", position: "absolute", zIndex: 9999 }}>
          {canScrollUp && (
            <button
              type="button"
              className="dress-suggest-scroll-btn dress-suggest-scroll-up"
              aria-label="Scroll suggestions up"
              onMouseDown={(e) => {
                e.preventDefault();
                scrollList("up");
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                scrollList("up");
              }}
            >
              <i className="fa-solid fa-chevron-up" /> Scroll up
            </button>
          )}
          <div
            ref={listRef}
            className="dress-suggest-dropdown"
            onScroll={updateScrollButtons}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
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
                      // Plain img — ZoomableImage steals touch and blocks list scroll on tablets.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="dress-suggest-thumb"
                        draggable={false}
                        style={{
                          width: 48,
                          height: 48,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          flexShrink: 0,
                          pointerEvents: "none",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--bg)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 18,
                          pointerEvents: "none",
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
          {canScrollDown && (
            <button
              type="button"
              className="dress-suggest-scroll-btn dress-suggest-scroll-down"
              aria-label="Scroll suggestions down"
              onMouseDown={(e) => {
                e.preventDefault();
                scrollList("down");
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                scrollList("down");
              }}
            >
              <i className="fa-solid fa-chevron-down" /> Scroll down
            </button>
          )}
        </div>
      )}
    </div>
  );
}
