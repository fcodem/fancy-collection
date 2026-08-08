"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { BRAND_NAME, BRAND_OWNER } from "@/lib/branding";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS } from "@/lib/realtime/types";
import CategorySelect from "@/components/CategorySelect";
import { MENS_CATEGORIES, REMOVED_SUB_CATEGORIES } from "@/lib/constants";
import { groupMensPrintProducts } from "@/lib/printCodesCollapse";
import {
  DEFAULT_PRINT_LABEL_MARGINS,
  PRINT_COLS,
  PRINT_PAGE_H_MM,
  PRINT_PAGE_W_MM,
  PRINT_ROWS,
  labelCellPositionWithMargins,
  loadPrintLabelMargins,
  normalizePrintLabelMargins,
  savePrintLabelMargins,
  type PrintLabelMargins,
} from "@/lib/printLabelMargins";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";

const REMOVED_SUB_SET = new Set(REMOVED_SUB_CATEGORIES.map((s) => s.toLowerCase()));
const MENS_SET = new Set(MENS_CATEGORIES.map((c) => c.toLowerCase()));

type ScanCode = { id: number; code: string; format: string; isPrimary: boolean };
type InventoryItem = {
  id: number;
  sku: string;
  name: string;
  category: string;
  size: string | null;
  color: string | null;
  unitCount?: number;
  displayName?: string;
  inventoryGroupId?: string | null;
  scanCodes: ScanCode[];
};

type PrintFormat = "QR_CODE" | "CODE_128" | "BOTH";

const COLS = PRINT_COLS;
const ROWS = PRINT_ROWS;
const PAGE_W_MM = PRINT_PAGE_W_MM;
const PAGE_H_MM = PRINT_PAGE_H_MM;
const LABELS_PER_PAGE = COLS * ROWS;

const QR_CELL_PAD_MM = 1.2;
const QR_SIZE_MM = 18;
const QR_COL_MM = 20;

function activeScanCode(item: InventoryItem, format: "QR_CODE" | "CODE_128") {
  return item.scanCodes.find((code) => code.format === format);
}

function isItemPrintReady(item: InventoryItem, format: PrintFormat): boolean {
  if (format === "QR_CODE") return Boolean(activeScanCode(item, "QR_CODE"));
  if (format === "CODE_128") return Boolean(activeScanCode(item, "CODE_128"));
  return Boolean(activeScanCode(item, "QR_CODE") && activeScanCode(item, "CODE_128"));
}

function missingPrintFormats(
  item: InventoryItem,
  format: PrintFormat,
): Array<"QR_CODE" | "CODE_128"> {
  const missing: Array<"QR_CODE" | "CODE_128"> = [];
  if ((format === "QR_CODE" || format === "BOTH") && !activeScanCode(item, "QR_CODE")) {
    missing.push("QR_CODE");
  }
  if ((format === "CODE_128" || format === "BOTH") && !activeScanCode(item, "CODE_128")) {
    missing.push("CODE_128");
  }
  return missing;
}

export default function PrintCodesClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  /** Persists across category / product switches so multi-dress print carts stay intact. */
  const [selectedBag, setSelectedBag] = useState<Record<number, InventoryItem>>({});
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [subCategoryOptions, setSubCategoryOptions] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [startCol, setStartCol] = useState(1);
  const [startRow, setStartRow] = useState(1);
  const [printFormat, setPrintFormat] = useState<PrintFormat>("QR_CODE");
  const [repairingId, setRepairingId] = useState<number | null>(null);
  /** How many identical labels to print per selected dress (for multi-unit stock). */
  const [copiesById, setCopiesById] = useState<Record<number, number>>({});
  /** Men's flow: which product accordion is expanded (selection is independent). */
  const [expandedMensKey, setExpandedMensKey] = useState<string | null>(null);
  const [margins, setMargins] = useState<PrintLabelMargins>(DEFAULT_PRINT_LABEL_MARGINS);
  const [marginsOpen, setMarginsOpen] = useState(false);
  const [marginsSavedMsg, setMarginsSavedMsg] = useState("");

  useEffect(() => {
    setMargins(loadPrintLabelMargins());
  }, []);

  const LABEL_W_MM = margins.labelWidthMm;
  const LABEL_H_MM = margins.labelHeightMm;
  const QR_USABLE_H_MM = LABEL_H_MM - QR_CELL_PAD_MM * 2;

  function updateMarginField<K extends keyof PrintLabelMargins>(key: K, value: string) {
    setMargins((prev) =>
      normalizePrintLabelMargins({ ...prev, [key]: Number(value) }),
    );
  }

  function saveMargins() {
    const next = normalizePrintLabelMargins(margins);
    setMargins(next);
    savePrintLabelMargins(next);
    setMarginsSavedMsg("Margins saved for this browser/printer.");
    window.setTimeout(() => setMarginsSavedMsg(""), 2500);
  }

  function resetMargins() {
    setMargins({ ...DEFAULT_PRINT_LABEL_MARGINS });
    savePrintLabelMargins(DEFAULT_PRINT_LABEL_MARGINS);
    setMarginsSavedMsg("Reset to Mazus ST-24 defaults.");
    window.setTimeout(() => setMarginsSavedMsg(""), 2500);
  }

  const isMensPrintMode = Boolean(category && MENS_SET.has(category.toLowerCase()));
  const mensProducts = isMensPrintMode ? groupMensPrintProducts(items) : [];
  const selectedCount = Object.keys(selectedBag).length;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sub-categories", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const names = Array.isArray(data?.sub_categories)
          ? data.sub_categories
              .map((s: { name: string }) => String(s.name || "").trim())
              .filter((n: string) => n && !REMOVED_SUB_SET.has(n.toLowerCase()))
          : [];
        setSubCategoryOptions(names);
      })
      .catch(() => {
        if (!cancelled) setSubCategoryOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (subCategory) params.set("sub_category", subCategory);
      if (q) params.set("q", q);
      params.set("all", "1");
      const res = await fetch(`/api/inventory/print-codes?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        setLoadError("Could not load print list. Try again.");
        return;
      }
      const data = await res.json();
      const nextItems: InventoryItem[] = data.items || [];
      setItems(nextItems);
      // Refresh QR status for anything already in the print cart.
      setSelectedBag((prev) => {
        if (!Object.keys(prev).length) return prev;
        const byId = new Map(nextItems.map((i) => [i.id, i]));
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          const numId = Number(id);
          const fresh = byId.get(numId);
          if (fresh) next[numId] = fresh;
        }
        return next;
      });
    } catch {
      setLoadError("Network error while loading inventory.");
    } finally {
      setLoading(false);
    }
  }, [category, subCategory, q]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  useRealtimeRefresh([...BOOKING_EVENTS, ...INVENTORY_EVENTS], () => {
    void fetchItems();
  });

  const runSearch = (e?: FormEvent) => {
    e?.preventDefault();
    setQ(searchInput.trim());
    // Keep existing cart selections across search.
  };

  const setCopies = (id: number, raw: number) => {
    const n = Math.max(1, Math.min(99, Math.floor(Number(raw) || 1)));
    setCopiesById((prev) => ({ ...prev, [id]: n }));
  };

  const toInventoryItem = (item: {
    id: number;
    sku: string;
    name: string;
    category: string;
    size: string | null;
    color: string | null;
    inventoryGroupId?: string | null;
    scanCodes: ScanCode[];
    unitCount?: number;
    displayName?: string;
  }): InventoryItem => ({
    id: item.id,
    sku: item.sku,
    name: item.displayName || item.name,
    category: item.category,
    size: item.size,
    color: item.color,
    inventoryGroupId: item.inventoryGroupId ?? null,
    scanCodes: item.scanCodes,
    unitCount: item.unitCount,
    displayName: item.displayName || item.name,
  });

  const toggleSelectItem = (raw: InventoryItem) => {
    const item = toInventoryItem(raw);
    setSelectedBag((prev) => {
      if (prev[item.id]) {
        const { [item.id]: _removed, ...rest } = prev;
        setCopiesById((c) => {
          const { [item.id]: _c, ...crest } = c;
          return crest;
        });
        return rest;
      }
      setCopiesById((c) => ({
        ...c,
        [item.id]: c[item.id] ?? Math.max(1, Math.min(99, item.unitCount || 1)),
      }));
      return { ...prev, [item.id]: item };
    });
  };

  /** Merge items into the cart (never replaces other products/categories). */
  const addItemsToSelection = (list: InventoryItem[]) => {
    if (!list.length) return;
    setSelectedBag((prev) => {
      const next = { ...prev };
      for (const raw of list) {
        const item = toInventoryItem(raw);
        next[item.id] = item;
      }
      return next;
    });
    setCopiesById((c) => {
      const next = { ...c };
      for (const raw of list) {
        const item = toInventoryItem(raw);
        if (next[item.id] == null) {
          next[item.id] = Math.max(1, Math.min(99, item.unitCount || 1));
        }
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedBag({});
    setCopiesById({});
  };

  const selectAllVisible = () => {
    if (isMensPrintMode) {
      const sizeItems = mensProducts.flatMap((p) =>
        p.sizes.map((s) => toInventoryItem(s.item as InventoryItem)),
      );
      const allSelected =
        sizeItems.length > 0 && sizeItems.every((i) => Boolean(selectedBag[i.id]));
      if (allSelected) {
        // Remove only currently visible men's sizes; keep other categories in cart.
        setSelectedBag((prev) => {
          const next = { ...prev };
          for (const i of sizeItems) delete next[i.id];
          return next;
        });
        setCopiesById((c) => {
          const next = { ...c };
          for (const i of sizeItems) delete next[i.id];
          return next;
        });
        return;
      }
      addItemsToSelection(sizeItems);
      return;
    }
    const allSelected = items.length > 0 && items.every((i) => Boolean(selectedBag[i.id]));
    if (allSelected) {
      setSelectedBag((prev) => {
        const next = { ...prev };
        for (const i of items) delete next[i.id];
        return next;
      });
      setCopiesById((c) => {
        const next = { ...c };
        for (const i of items) delete next[i.id];
        return next;
      });
      return;
    }
    addItemsToSelection(items);
  };

  const selectedItems = Object.values(selectedBag);
  const printableSelected = selectedItems.filter((item) => isItemPrintReady(item, printFormat));
  const blockedPrintCount = selectedItems.length - printableSelected.length;

  /** Expand each dress by its copy count (same QR repeated for each unit). */
  const labelSlots: InventoryItem[] = [];
  for (const item of printableSelected) {
    const copies = Math.max(1, Math.min(99, copiesById[item.id] || 1));
    for (let i = 0; i < copies; i++) labelSlots.push(item);
  }
  const totalLabels = labelSlots.length;

  const generateMissingCodes = async (itemId: number, formats: Array<"QR_CODE" | "CODE_128">) => {
    setRepairingId(itemId);
    try {
      for (const labelFormat of formats) {
        const response = await fetch(`/api/inventory/${itemId}/scan-codes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "generate", labelFormat }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "Could not generate scan code.");
        }
      }
      await fetchItems();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not generate scan code.");
    } finally {
      setRepairingId(null);
    }
  };

  const buildPages = () => {
    const pages: (InventoryItem | null)[][] = [];
    if (totalLabels === 0) return pages;

    const skipSlots = (startRow - 1) * COLS + (startCol - 1);
    let currentPage: (InventoryItem | null)[] = [];

    for (let i = 0; i < skipSlots; i++) {
      currentPage.push(null);
    }

    for (const item of labelSlots) {
      if (currentPage.length >= LABELS_PER_PAGE) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push(item);
    }

    if (currentPage.length > 0) {
      while (currentPage.length < LABELS_PER_PAGE) {
        currentPage.push(null);
      }
      pages.push(currentPage);
    }

    return pages;
  };

  const pages = buildPages();

  const handlePrint = () => {
    if (totalLabels === 0 || pages.length === 0) return;
    const printedIds = printableSelected.map((i) => i.id);
    let cleared = false;

    const clearPrinted = () => {
      if (cleared) return;
      cleared = true;
      setSelectedBag((prev) => {
        const next = { ...prev };
        for (const id of printedIds) delete next[id];
        return next;
      });
      setCopiesById((prev) => {
        const next = { ...prev };
        for (const id of printedIds) delete next[id];
        return next;
      });
    };

    const onAfterPrint = () => {
      clearPrinted();
      window.removeEventListener("afterprint", onAfterPrint);
    };
    window.addEventListener("afterprint", onAfterPrint);
    window.print();
  };

  const renderSizeOrItemCard = (item: InventoryItem, opts?: { sizeTitle?: string }) => {
    const missing = missingPrintFormats(item, printFormat);
    const checked = Boolean(selectedBag[item.id]);
    const sizeLabel = opts?.sizeTitle || item.size || "—";
    return (
      <div
        key={item.id}
        className={`flex items-start gap-3 p-3 border rounded transition-colors ${
          checked ? "bg-blue-50 border-blue-400" : "bg-white border-gray-200 hover:border-gray-300"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleSelectItem(item)}
          className="w-4 h-4 text-blue-600 mt-1"
        />
        <div className="min-w-0 flex-1">
          {opts?.sizeTitle ? (
            <p className="text-sm font-bold">SIZE {sizeLabel}</p>
          ) : (
            <p className="text-sm font-medium truncate">{item.name}</p>
          )}
          <p className="text-xs text-gray-500">
            {item.sku}
            {!opts?.sizeTitle && item.category ? <span> · {item.category}</span> : null}
            {!opts?.sizeTitle && item.size ? <span> · {item.size}</span> : null}
            {(item.unitCount || 1) > 1 ? (
              <span> · {item.unitCount} units · 1 QR</span>
            ) : opts?.sizeTitle ? (
              <span> · 1 QR for this size</span>
            ) : null}
          </p>
          {missing.length > 0 ? (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-amber-700">QR code missing</p>
              <button
                type="button"
                className="text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded hover:bg-amber-200 disabled:opacity-50"
                disabled={repairingId === item.id}
                onClick={() => void generateMissingCodes(item.id, missing)}
              >
                {repairingId === item.id ? "Generating…" : "Generate code"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-green-700 mt-1">
              Registered
              {opts?.sizeTitle ? ` · unique QR for size ${sizeLabel}` : ""}
              {(item.unitCount || 1) > 1 && !opts?.sizeTitle
                ? ` · ${item.unitCount} units share one QR`
                : ""}
            </p>
          )}
          {checked && missing.length === 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-600 font-semibold" htmlFor={`copies-${item.id}`}>
                {opts?.sizeTitle ? "Qty of this size QR" : "Labels / units"}
              </label>
              <input
                id={`copies-${item.id}`}
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={copiesById[item.id] ?? 1}
                onChange={(e) => setCopies(item.id, Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="border rounded px-2 py-1 text-sm w-16"
              />
              {(item.unitCount || 1) > 1 ? (
                <button
                  type="button"
                  className="text-xs text-blue-700 underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCopies(item.id, item.unitCount || 1);
                  }}
                >
                  All {item.unitCount} units
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="print-codes-root min-h-screen bg-gray-50 p-4">
      <style>{`
        /* Keep sticker sheets off-screen until Print (must not take layout height). */
        .print-area {
          position: absolute;
          left: -10000px;
          top: 0;
          width: ${PAGE_W_MM}mm;
          height: 0;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
        }
        @media print {
          @page {
            size: ${PAGE_W_MM}mm ${PAGE_H_MM}mm;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: auto !important;
            height: auto !important;
            min-height: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Hide UI; only sticker sheets print (fixes blank page + multi-page clip). */
          .print-codes-root {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            background: transparent !important;
          }
          .no-print { display: none !important; }
          .print-area {
            display: block !important;
            position: static !important;
            left: auto !important;
            top: auto !important;
            width: ${PAGE_W_MM}mm !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            opacity: 1 !important;
            pointer-events: auto !important;
          }
          .label-page {
            position: relative;
            width: ${PAGE_W_MM}mm;
            height: ${PAGE_H_MM}mm;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .label-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .label-cell {
            position: absolute;
            width: ${LABEL_W_MM}mm;
            height: ${LABEL_H_MM}mm;
            max-width: ${LABEL_W_MM}mm;
            max-height: ${LABEL_H_MM}mm;
            overflow: hidden;
            box-sizing: border-box;
            padding: ${QR_CELL_PAD_MM}mm;
          }
          .label-cell.label-qr-only {
            display: grid;
            grid-template-columns: minmax(0, 1fr) ${QR_COL_MM}mm;
            column-gap: 1mm;
            align-items: center;
            justify-items: stretch;
            padding: ${QR_CELL_PAD_MM}mm;
          }
          .label-cell.label-barcode-only,
          .label-cell.label-both {
            display: flex;
            flex-direction: column;
            gap: 0.4mm;
          }
          .label-row {
            display: contents;
          }
          .label-left {
            min-width: 0;
            max-height: 100%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: flex-start;
            text-align: left;
          }
          .label-code-block {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            width: ${QR_COL_MM}mm;
            max-width: ${QR_COL_MM}mm;
            height: ${QR_USABLE_H_MM}mm;
            max-height: ${QR_USABLE_H_MM}mm;
            padding-top: 0;
            overflow: visible;
            min-width: 0;
            background: #fff;
          }
          .label-cell img.label-qr,
          .label-cell canvas.label-qr {
            width: ${QR_SIZE_MM}mm !important;
            height: ${QR_SIZE_MM}mm !important;
            max-width: ${QR_SIZE_MM}mm !important;
            max-height: ${QR_SIZE_MM}mm !important;
            display: block;
            flex: 0 0 auto;
            object-fit: contain;
            background: #fff;
            image-rendering: pixelated;
            image-rendering: crisp-edges;
          }
          .label-both img.label-qr,
          .label-both canvas.label-qr {
            width: 12mm !important;
            height: 12mm !important;
            max-width: 12mm !important;
            max-height: 12mm !important;
          }
          .label-cell svg.barcode-svg {
            width: 100% !important;
            max-width: 58mm !important;
            height: auto !important;
            max-height: 7mm !important;
          }
          .label-both svg.barcode-svg {
            max-height: 5.5mm !important;
          }
          .label-text {
            font-family: Arial, Helvetica, sans-serif;
            text-align: left;
            overflow: hidden;
            width: 100%;
            max-height: 100%;
          }
          .label-name {
            font-weight: 900;
            font-size: 7pt;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            line-height: 1.05;
            max-width: 100%;
            text-transform: uppercase;
            word-break: break-word;
          }
          .label-brand {
            color: #7B1F45;
            letter-spacing: 0.2pt;
            margin-bottom: 0.15mm;
            line-height: 1.05;
            font-size: 5pt;
          }
          .label-size-badge {
            display: inline-flex;
            font-size: 6pt;
            font-weight: 900;
            border: 1pt solid #333;
            border-radius: 2px;
            padding: 0.1mm 0.8mm;
            margin-top: 0.25mm;
            line-height: 1.1;
          }
          .label-sku {
            font-size: 5pt;
            font-weight: 700;
            font-family: "Courier New", monospace;
            color: #333;
            margin-top: 0.2mm;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto no-print">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Print QR Codes — Mazus A4 ST-24 (64×33.9mm, 24 labels)
          </h1>

          <div className="bg-white border rounded-lg p-4 mb-4">
            <h2 className="font-semibold text-sm text-gray-700 mb-3">Print Settings</h2>
            <form
              className="flex flex-wrap gap-4 items-end mb-4"
              onSubmit={runSearch}
            >
              <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                <label className="block text-xs text-gray-500 mb-1">Search dresses</label>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Dress name, SKU, or color…"
                  className="border rounded px-3 py-2 text-sm w-full"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Category</label>
                <CategorySelect
                  value={category}
                  className="border rounded px-3 py-2 text-sm"
                  onChange={(v) => {
                    setCategory(v);
                    setExpandedMensKey(null);
                    // Keep selectedBag — cart persists across categories.
                  }}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sub-Category</label>
                <select
                  value={subCategory}
                  onChange={(e) => {
                    setSubCategory(e.target.value);
                  }}
                  className="border rounded px-3 py-2 text-sm"
                  aria-label="Sub-category"
                >
                  <option value="">All Sub-Categories</option>
                  {subCategory && !subCategoryOptions.includes(subCategory) && (
                    <option value={subCategory}>{subCategory}</option>
                  )}
                  {subCategoryOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Searching…" : "Search"}
              </button>
              {(q || category || subCategory) && (
                <button
                  type="button"
                  className="border px-4 py-2 rounded text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setSearchInput("");
                    setQ("");
                    setCategory("");
                    setSubCategory("");
                    setExpandedMensKey(null);
                  }}
                >
                  Clear filters
                </button>
              )}
              {selectedCount > 0 ? (
                <button
                  type="button"
                  className="border border-amber-300 bg-amber-50 px-4 py-2 rounded text-sm text-amber-900 hover:bg-amber-100"
                  onClick={clearSelection}
                >
                  Clear cart ({selectedCount})
                </button>
              ) : null}
            </form>
            {isMensPrintMode ? (
              <div className="mb-4 p-3 rounded border border-indigo-200 bg-indigo-50/60">
                <p className="text-sm font-semibold text-indigo-900 mb-1">
                  Men&apos;s QR print — all products listed below
                </p>
                <p className="text-xs text-indigo-800">
                  Click a product to open its sizes, tick sizes, set quantity. Switching product or
                  category keeps your previous selections in the print cart.
                </p>
              </div>
            ) : null}
            {selectedCount > 0 ? (
              <p className="text-xs text-blue-800 mb-3 font-medium">
                Print cart: {selectedCount} size/dress selected · {totalLabels} label(s) ready
                (kept when you change category or product)
              </p>
            ) : null}
            <div className="mb-4 border rounded-lg bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Label margin setup</p>
                  <p className="text-xs text-gray-500">
                    Tune page margins if stickers drift differently on each printer sheet.
                    Saved in this browser.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PrefetchOnIntentLink
                    href="/inventory/print-codes/margins"
                    className="text-sm text-blue-700 underline"
                  >
                    Open full margin page
                  </PrefetchOnIntentLink>
                  <button
                    type="button"
                    className="border rounded px-3 py-1.5 text-sm"
                    onClick={() => setMarginsOpen((v) => !v)}
                  >
                    {marginsOpen ? "Hide margins" : "Adjust margins"}
                  </button>
                </div>
              </div>
              {marginsOpen ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ["pageMarginTopMm", "Top (mm)"],
                      ["pageMarginBottomMm", "Bottom (mm)"],
                      ["pageMarginLeftMm", "Left (mm)"],
                      ["pageMarginRightMm", "Right (mm)"],
                      ["colGapMm", "Column gap (mm)"],
                      ["rowGapMm", "Row gap (mm)"],
                      ["labelWidthMm", "Label width (mm)"],
                      ["labelHeightMm", "Label height (mm)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-xs text-gray-600">
                      {label}
                      <input
                        type="number"
                        step="0.1"
                        className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
                        value={margins[key]}
                        onChange={(e) => updateMarginField(key, e.target.value)}
                      />
                    </label>
                  ))}
                  <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
                      onClick={saveMargins}
                    >
                      Save margins
                    </button>
                    <button
                      type="button"
                      className="border rounded px-3 py-1.5 text-sm"
                      onClick={resetMargins}
                    >
                      Reset Mazus defaults
                    </button>
                    {marginsSavedMsg ? (
                      <span className="text-xs text-green-700">{marginsSavedMsg}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Label type</label>
                <select
                  value={printFormat}
                  onChange={(e) => setPrintFormat(e.target.value as PrintFormat)}
                  className="border rounded px-3 py-2 text-sm"
                >
                  <option value="QR_CODE">QR Code</option>
                  <option value="CODE_128">Code 128 Barcode</option>
                  <option value="BOTH">QR + Barcode</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start Column</label>
                <select
                  value={startCol}
                  onChange={(e) => setStartCol(Number(e.target.value))}
                  className="border rounded px-3 py-2 text-sm"
                >
                  <option value={1}>Column 1 (Left)</option>
                  <option value={2}>Column 2 (Middle)</option>
                  <option value={3}>Column 3 (Right)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start Row</label>
                <select
                  value={startRow}
                  onChange={(e) => setStartRow(Number(e.target.value))}
                  className="border rounded px-3 py-2 text-sm"
                >
                  {Array.from({ length: ROWS }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Row {i + 1}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={selectAllVisible}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                disabled={loading || (isMensPrintMode ? mensProducts.length === 0 : items.length === 0)}
              >
                {isMensPrintMode ? "Add all sizes (this category)" : "Add all visible"}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={totalLabels === 0 || blockedPrintCount > 0}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🖨️ Print {totalLabels} label{totalLabels === 1 ? "" : "s"}
                {pages.length > 0 ? ` · ${pages.length} page${pages.length === 1 ? "" : "s"}` : ""}
              </button>
            </div>
            {blockedPrintCount > 0 ? (
              <p className="text-xs text-amber-700 mt-2">
                {blockedPrintCount} selected item(s) are missing registered QR/barcode mappings.
                Generate codes before printing — unregistered SKU fallbacks are not printed.
              </p>
            ) : null}
            <p className="text-xs text-gray-400 mt-2">
              Mazus ST-24 · skip {(startRow - 1) * COLS + (startCol - 1)} sticker(s) on sheet 1 ·
              {" "}{totalLabels} label(s) across {pages.length || 0} page(s).
              After print, printed dresses are deselected automatically.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Print at <strong>100% / Actual Size</strong>. Disable &quot;Fit to page&quot;.
              Paper: A4. Margins: <strong>None</strong>. First/last rows need edge-safe quiet zone — do not scale.
              Set quantity per size for multi-unit labels (same size shares one QR).
            </p>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading inventory...</p>
          ) : loadError ? (
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">
              {loadError}{" "}
              <button type="button" className="underline" onClick={() => void fetchItems()}>
                Retry
              </button>
            </p>
          ) : items.length === 0 ? (
            <p className="text-gray-500">
              {q || category
                ? "No dresses matched your search. Try another name, SKU, or clear filters."
                : "No inventory items found. Pick a category to load faster."}
            </p>
          ) : isMensPrintMode ? (
            <div className="space-y-3">
              {mensProducts.map((product) => {
                const open = expandedMensKey === product.key;
                const selectedInProduct = product.sizes.filter((s) =>
                  Boolean(selectedBag[s.item.id]),
                ).length;
                return (
                  <div key={product.key} className="bg-white border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50"
                      onClick={() =>
                        setExpandedMensKey((prev) => (prev === product.key ? null : product.key))
                      }
                    >
                      <div>
                        <span className="font-semibold text-gray-900">{product.name}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          · {product.category} · {product.sizes.length} size
                          {product.sizes.length === 1 ? "" : "s"}
                          {selectedInProduct > 0
                            ? ` · ${selectedInProduct} in cart`
                            : ""}
                        </span>
                      </div>
                      <span className="text-sm text-blue-700 font-medium">
                        {open ? "Hide sizes ▲" : "Select sizes ▼"}
                      </span>
                    </button>
                    {open ? (
                      <div className="border-t px-4 py-3 space-y-3 bg-slate-50/60">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="text-sm text-blue-700 underline"
                            onClick={() =>
                              addItemsToSelection(
                                product.sizes.map((s) => toInventoryItem(s.item as InventoryItem)),
                              )
                            }
                          >
                            Add all sizes of this product
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {product.sizes.map(({ size, item }) =>
                            renderSizeOrItemCard(toInventoryItem(item as InventoryItem), {
                              sizeTitle: size,
                            }),
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((item) => renderSizeOrItemCard(item))}
            </div>
          )}

          {selectedCount > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold text-gray-700 mb-2">
                Preview (page 1 of {pages.length || 1}) — {totalLabels} label(s)
              </h2>
              <div className="border rounded bg-white p-2 inline-block">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 90px)",
                    gridTemplateRows: "repeat(8, 48px)",
                    gap: "1px",
                  }}
                >
                  {(pages[0] || []).map((item, idx) => (
                    <div
                      key={idx}
                      className={`border flex text-[7px] ${
                        item ? "bg-blue-50 border-blue-300" : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex-1 p-0.5 flex flex-col justify-center min-w-0 overflow-hidden">
                        {item ? (
                          <>
                            <div className="font-bold text-[6px] text-[#7B1F45] truncate">{BRAND_NAME}</div>
                            <div className="font-semibold truncate">{item.name}</div>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </div>
                      {item ? (
                        <div className="w-5 border-l flex items-center justify-center text-gray-400">QR</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

        <div className="print-area" aria-hidden={totalLabels === 0}>
          {pages.map((page, pageIdx) => (
            <div key={pageIdx} className="label-page">
              {page.map((item, slotIdx) => {
                const { leftMm, topMm } = labelCellPositionWithMargins(slotIdx, margins, COLS);
                const layoutClass =
                  item &&
                  (printFormat === "QR_CODE"
                    ? "label-qr-only"
                    : printFormat === "CODE_128"
                      ? "label-barcode-only"
                      : "label-both");
                return (
                  <div
                    key={`${pageIdx}-${slotIdx}-${item?.id ?? "empty"}`}
                    className={`label-cell${layoutClass ? ` ${layoutClass}` : ""}`}
                    style={{ left: `${leftMm}mm`, top: `${topMm}mm` }}
                  >
                    {item && <StickerLabel item={item} format={printFormat} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
    </div>
  );
}

function StickerLabel({ item, format }: { item: InventoryItem; format: PrintFormat }) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [qrSrc, setQrSrc] = useState<string>("");

  const qrCode = activeScanCode(item, "QR_CODE");
  const barcode = activeScanCode(item, "CODE_128");
  const qrValue = qrCode?.code;
  const barcodeValue = barcode?.code;

  useEffect(() => {
    let cancelled = false;
    if ((format === "QR_CODE" || format === "BOTH") && qrValue) {
      void QRCode.toDataURL(qrValue, {
        width: format === "BOTH" ? 280 : 480,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: "#000000", light: "#FFFFFF" },
      }).then((url) => {
        if (!cancelled) setQrSrc(url);
      });
    } else {
      setQrSrc("");
    }
    return () => {
      cancelled = true;
    };
  }, [qrValue, format]);

  useEffect(() => {
    if ((format === "CODE_128" || format === "BOTH") && barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          width: format === "BOTH" ? 1 : 1.4,
          height: format === "BOTH" ? 24 : 32,
          displayValue: false,
          margin: 4,
        });
      } catch {
        /* invalid barcode value */
      }
    }
  }, [barcodeValue, format]);

  if (!isItemPrintReady(item, format)) {
    return (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#b54708",
        }}
      >
        Missing registered code
      </div>
    );
  }

  return (
    <div className="label-row">
      <div className="label-left">
        <div className="label-text">
          <div className="label-brand">
            <div style={{ fontWeight: 900, fontSize: "5.5pt" }}>{BRAND_NAME}</div>
            <div style={{ fontWeight: 600, fontSize: "4.5pt", marginTop: "0.15mm" }}>by {BRAND_OWNER}</div>
          </div>
          <div className="label-name">{item.name}</div>
          {item.size ? <div className="label-size-badge">SIZE {item.size}</div> : null}
          {item.sku ? <div className="label-sku">SKU: {item.sku}</div> : null}
        </div>
      </div>
      <div className="label-code-block">
        {(format === "QR_CODE" || format === "BOTH") && qrSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} className="label-qr" alt="" />
        ) : null}
        {(format === "CODE_128" || format === "BOTH") && barcodeValue ? (
          <svg ref={barcodeRef} className="barcode-svg" />
        ) : null}
      </div>
    </div>
  );
}
