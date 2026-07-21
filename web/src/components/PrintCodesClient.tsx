"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { BRAND_NAME, BRAND_OWNER } from "@/lib/branding";

type ScanCode = { id: number; code: string; format: string; isPrimary: boolean };
type InventoryItem = {
  id: number;
  sku: string;
  name: string;
  category: string;
  size: string | null;
  color: string | null;
  scanCodes: ScanCode[];
};

type PrintFormat = "QR_CODE" | "CODE_128" | "BOTH";

/** A4 24-up sheet — measured: 60×30 mm labels, 10 mm page margins (Apple Measure). */
const COLS = 3;
const ROWS = 8;
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const PAGE_MARGIN_MM = 10;
const LABEL_W_MM = 60;
const LABEL_H_MM = 30;
const LABELS_PER_PAGE = COLS * ROWS;
/** Printable area after 1 cm margins on all sides. */
const PRINT_W_MM = PAGE_W_MM - PAGE_MARGIN_MM * 2;
const PRINT_H_MM = PAGE_H_MM - PAGE_MARGIN_MM * 2;
/** Gutter between die-cut labels on the physical sheet. */
const COL_GAP_MM = (PRINT_W_MM - COLS * LABEL_W_MM) / (COLS - 1);
const ROW_GAP_MM = (PRINT_H_MM - ROWS * LABEL_H_MM) / (ROWS - 1);
const QR_COL_MM = 18;
const QR_SIZE_MM = 15;

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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [category, setCategory] = useState("");
  const [startCol, setStartCol] = useState(1);
  const [startRow, setStartRow] = useState(1);
  const [printFormat, setPrintFormat] = useState<PrintFormat>("QR_CODE");
  const [repairingId, setRepairingId] = useState<number | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      params.set("all", "1");
      const res = await fetch(`/api/inventory/print-codes?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const selectedItems = items.filter((i) => selected.has(i.id));
  const printableSelected = selectedItems.filter((item) => isItemPrintReady(item, printFormat));
  const blockedPrintCount = selectedItems.length - printableSelected.length;

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
    const skipSlots = (startRow - 1) * COLS + (startCol - 1);
    let currentPage: (InventoryItem | null)[] = [];

    for (let i = 0; i < skipSlots; i++) {
      currentPage.push(null);
    }

    for (const item of printableSelected) {
      if (currentPage.length >= LABELS_PER_PAGE) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push(item);
    }

    while (currentPage.length < LABELS_PER_PAGE) {
      currentPage.push(null);
    }
    if (currentPage.length > 0) pages.push(currentPage);

    return pages;
  };

  const pages = buildPages();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-area {
            display: block !important;
            position: static !important;
            left: auto !important;
            top: auto !important;
          }
          .label-page {
            width: ${PAGE_W_MM}mm;
            height: ${PAGE_H_MM}mm;
            box-sizing: border-box;
            padding: ${PAGE_MARGIN_MM}mm;
            page-break-after: always;
            display: grid;
            grid-template-columns: repeat(3, ${LABEL_W_MM}mm);
            grid-template-rows: repeat(8, ${LABEL_H_MM}mm);
            column-gap: ${COL_GAP_MM}mm;
            row-gap: ${ROW_GAP_MM}mm;
            margin: 0;
          }
          .label-page:last-child {
            page-break-after: auto;
          }
          .label-cell {
            width: ${LABEL_W_MM}mm;
            height: ${LABEL_H_MM}mm;
            overflow: hidden;
            box-sizing: border-box;
            padding: 1.5mm;
          }
          .label-cell.label-qr-only {
            display: grid;
            grid-template-columns: minmax(0, 1fr) ${QR_COL_MM}mm;
            column-gap: 1mm;
            align-items: center;
            padding: 1mm 1.5mm;
          }
          .label-cell.label-barcode-only,
          .label-cell.label-both {
            display: flex;
            flex-direction: column;
            gap: 0.5mm;
          }
          .label-row {
            display: contents;
          }
          .label-left {
            min-width: 0;
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
            width: ${QR_COL_MM}mm;
            max-width: ${QR_COL_MM}mm;
            min-width: 0;
          }
          .label-cell canvas.label-qr {
            width: ${QR_SIZE_MM}mm !important;
            height: ${QR_SIZE_MM}mm !important;
            max-width: ${QR_SIZE_MM}mm !important;
            max-height: ${QR_SIZE_MM}mm !important;
            display: block;
          }
          .label-both canvas.label-qr {
            width: 12mm !important;
            height: 12mm !important;
            max-width: 12mm !important;
            max-height: 12mm !important;
          }
          .label-cell svg.barcode-svg {
            width: 100% !important;
            max-width: 54mm !important;
            height: auto !important;
            max-height: 8mm !important;
          }
          .label-both svg.barcode-svg {
            max-height: 6mm !important;
          }
          .label-text {
            font-family: Arial, sans-serif;
            text-align: left;
            overflow: hidden;
            width: 100%;
          }
          .label-name {
            font-weight: 900;
            font-size: 9pt;
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
            letter-spacing: 0.3pt;
            margin-bottom: 0.3mm;
            line-height: 1.1;
          }
          .label-size-badge {
            display: inline-flex;
            font-size: 8pt;
            font-weight: 900;
            border: 1.5pt solid #333;
            border-radius: 3px;
            padding: 0.2mm 1.2mm;
            margin-top: 0.5mm;
            line-height: 1.1;
          }
          .label-sku {
            font-size: 6pt;
            font-weight: 700;
            font-family: "Courier New", monospace;
            color: #333;
            margin-top: 0.4mm;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto">
        <div className="no-print mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Print QR Codes — A4 Sticker Sheet (24 labels, 60×30mm, 1cm margins)
          </h1>

          <div className="bg-white border rounded-lg p-4 mb-4">
            <h2 className="font-semibold text-sm text-gray-700 mb-3">Print Settings</h2>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="border rounded px-3 py-2 text-sm"
                >
                  <option value="">All Categories</option>
                  <option value="Lehenga">Lehenga</option>
                  <option value="Sherwani">Sherwani</option>
                  <option value="Gown">Gown</option>
                  <option value="Suit">Suit</option>
                  <option value="Saree">Saree</option>
                  <option value="Indo-Western">Indo-Western</option>
                  <option value="Jewellery">Jewellery</option>
                </select>
              </div>
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
                onClick={selectAll}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
              >
                {selected.size === items.length ? "Deselect All" : "Select All"}
              </button>
              <button
                onClick={handlePrint}
                disabled={printableSelected.length === 0 || blockedPrintCount > 0}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🖨️ Print Selected ({printableSelected.length})
              </button>
            </div>
            {blockedPrintCount > 0 ? (
              <p className="text-xs text-amber-700 mt-2">
                {blockedPrintCount} selected item(s) are missing registered QR/barcode mappings.
                Generate codes before printing — unregistered SKU fallbacks are not printed.
              </p>
            ) : null}
            <p className="text-xs text-gray-400 mt-2">
              24 labels per A4 sheet (3×8 grid, 60×30mm). Page margins: 1cm top/bottom/left/right.
              Each label: left = branding + dress name + size; right = QR code.
              Skipping {(startRow - 1) * COLS + (startCol - 1)} sticker(s) on the first sheet. Total pages: {pages.length}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Print at 100% scale (Actual Size). Disable &quot;Fit to page&quot;. Paper: A4. Margins: None or minimum.
            </p>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading inventory...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500">No inventory items found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((item) => {
                const missing = missingPrintFormats(item, printFormat);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 p-3 border rounded transition-colors ${
                      selected.has(item.id)
                        ? "bg-blue-50 border-blue-400"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 text-blue-600 mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {item.sku} &middot; {item.category}
                        {item.size && <span> &middot; {item.size}</span>}
                      </p>
                      {missing.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-amber-700">
                            QR code missing
                            {missing.includes("CODE_128") ? " / barcode missing" : ""}
                          </p>
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
                          Registered for {printFormat === "BOTH" ? "QR + barcode" : printFormat}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selected.size > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold text-gray-700 mb-2">Preview (first page, 3×8)</h2>
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

        <div className="print-area" style={{ position: "fixed", left: "-9999px", top: 0 }}>
          {pages.map((page, pageIdx) => (
            <div key={pageIdx} className="label-page">
              {page.map((item, slotIdx) => {
                const layoutClass =
                  item &&
                  (printFormat === "QR_CODE"
                    ? "label-qr-only"
                    : printFormat === "CODE_128"
                      ? "label-barcode-only"
                      : "label-both");
                return (
                  <div key={slotIdx} className={`label-cell${layoutClass ? ` ${layoutClass}` : ""}`}>
                    {item && <StickerLabel item={item} format={printFormat} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StickerLabel({ item, format }: { item: InventoryItem; format: PrintFormat }) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);

  const qrCode = activeScanCode(item, "QR_CODE");
  const barcode = activeScanCode(item, "CODE_128");
  const qrValue = qrCode?.code;
  const barcodeValue = barcode?.code;

  useEffect(() => {
    if ((format === "QR_CODE" || format === "BOTH") && qrRef.current && qrValue) {
      void QRCode.toCanvas(qrRef.current, qrValue, {
        width: format === "BOTH" ? 100 : 120,
        margin: 1,
        errorCorrectionLevel: "H",
      });
    }
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
            <div style={{ fontWeight: 900, fontSize: "7pt" }}>{BRAND_NAME}</div>
            <div style={{ fontWeight: 600, fontSize: "5.5pt", marginTop: "0.2mm" }}>by {BRAND_OWNER}</div>
          </div>
          <div className="label-name">{item.name}</div>
          <div className="label-size-badge">SIZE {item.size || "—"}</div>
          {item.sku ? <div className="label-sku">SKU: {item.sku}</div> : null}
        </div>
      </div>
      <div className="label-code-block">
        {(format === "QR_CODE" || format === "BOTH") && qrValue ? (
          <canvas ref={qrRef} className="label-qr" />
        ) : null}
        {(format === "CODE_128" || format === "BOTH") && barcodeValue ? (
          <>
            <svg ref={barcodeRef} className="barcode-svg" />
          </>
        ) : null}
      </div>
    </div>
  );
}
