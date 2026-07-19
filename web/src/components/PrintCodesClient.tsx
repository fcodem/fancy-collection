"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import { BRAND_PRINT_LABEL } from "@/lib/branding";

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

const COLS = 3;
const ROWS = 8;
const LABELS_PER_PAGE = COLS * ROWS; // 24

export default function PrintCodesClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [category, setCategory] = useState("");
  const [startCol, setStartCol] = useState(1);
  const [startRow, setStartRow] = useState(1);
  const [printFormat, setPrintFormat] = useState<PrintFormat>("QR_CODE");

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

  // Build pages: each page has 24 label slots (3x8).
  // First page may have empty slots if starting from a specific position.
  const buildPages = () => {
    const pages: (InventoryItem | null)[][] = [];
    const skipSlots = (startRow - 1) * COLS + (startCol - 1);
    let currentPage: (InventoryItem | null)[] = [];

    // Fill skipped slots on first page with null
    for (let i = 0; i < skipSlots; i++) {
      currentPage.push(null);
    }

    for (const item of selectedItems) {
      if (currentPage.length >= LABELS_PER_PAGE) {
        pages.push(currentPage);
        currentPage = [];
      }
      currentPage.push(item);
    }

    // Pad last page
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
      {/* Print-specific styles */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 4.5mm 0mm 4.5mm 0mm;
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
            width: 210mm;
            height: 296mm;
            page-break-after: always;
            display: grid;
            grid-template-columns: repeat(3, 70mm);
            grid-template-rows: repeat(8, 37mm);
            padding: 0;
            margin: 0;
          }
          .label-page:last-child {
            page-break-after: auto;
          }
          .label-cell {
            width: 70mm;
            height: 37mm;
            overflow: hidden;
            display: flex;
            flex-direction: row;
            align-items: stretch;
            justify-content: space-between;
            padding: 1.5mm;
            box-sizing: border-box;
            gap: 1mm;
          }
          .label-left {
            flex: 1 1 50%;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: flex-start;
            text-align: left;
          }
          .label-right {
            flex: 0 0 32mm;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .label-cell canvas {
            width: 30mm !important;
            height: 30mm !important;
          }
          .label-cell svg.barcode-svg {
            width: 62mm !important;
            height: 10mm !important;
          }
          .label-text {
            font-size: 7pt;
            line-height: 1.15;
            font-family: Arial, sans-serif;
            text-align: left;
            overflow: hidden;
            width: 100%;
          }
          .label-name {
            font-weight: bold;
            font-size: 7pt;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            line-height: 1.1;
            max-width: 100%;
          }
          .label-brand {
            font-size: 5.5pt;
            font-weight: bold;
            color: #7B1F45;
            letter-spacing: 0.2pt;
            margin-bottom: 0.8mm;
            line-height: 1.1;
          }
          .label-size {
            font-size: 6.5pt;
            color: #333;
            margin-top: 0.6mm;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto">
        {/* Controls - hidden during print */}
        <div className="no-print mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Print QR Codes — A4 Sticker Sheet (24 labels, 70×37mm)
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
                disabled={selected.size === 0}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🖨️ Print Selected ({selected.size})
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Skipping {(startRow - 1) * COLS + (startCol - 1)} sticker(s) on the first sheet.
              Total pages needed: {pages.length}
            </p>
          </div>

          {/* Inventory selection grid */}
          {loading ? (
            <p className="text-gray-500">Loading inventory...</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500">No inventory items found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    selected.has(item.id)
                      ? "bg-blue-50 border-blue-400"
                      : "bg-white border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.sku} &middot; {item.category}
                      {item.size && <span> &middot; {item.size}</span>}
                      {item.scanCodes.length > 0 && (
                        <span className="ml-1 text-green-600">
                          ({item.scanCodes.length} code{item.scanCodes.length > 1 ? "s" : ""})
                        </span>
                      )}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Preview */}
          {selected.size > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold text-gray-700 mb-2">Preview (first page)</h2>
              <div className="border rounded bg-white p-2 inline-block">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 90px)",
                    gridTemplateRows: `repeat(8, 48px)`,
                    gap: "1px",
                  }}
                >
                  {(pages[0] || []).map((item, idx) => (
                    <div
                      key={idx}
                      className={`border text-center flex items-center justify-center text-[8px] ${
                        item ? "bg-blue-50 border-blue-300" : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      {item ? (
                        <span className="truncate px-0.5">{item.name}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Print area — only visible during print */}
        <div className="print-area" style={{ position: "fixed", left: "-9999px", top: 0 }}>
          {pages.map((page, pageIdx) => (
            <div key={pageIdx} className="label-page">
              {page.map((item, slotIdx) => (
                <div key={slotIdx} className="label-cell">
                  {item && <StickerLabel item={item} format={printFormat} />}
                </div>
              ))}
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

  const qrCode = item.scanCodes.find((c) => c.format === "QR_CODE");
  const barcode = item.scanCodes.find((c) => c.format === "CODE_128");
  const qrValue = qrCode?.code || item.sku;
  const barcodeValue = barcode?.code || qrCode?.code || item.sku;

  useEffect(() => {
    if ((format === "QR_CODE" || format === "BOTH") && qrRef.current) {
      void QRCode.toCanvas(qrRef.current, qrValue, {
        width: 200,
        margin: 1,
        errorCorrectionLevel: "H",
      });
    }
  }, [qrValue, format]);

  useEffect(() => {
    if ((format === "CODE_128" || format === "BOTH") && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          width: 1.2,
          height: 32,
          displayValue: false,
          margin: 0,
        });
      } catch {
        /* invalid barcode value */
      }
    }
  }, [barcodeValue, format]);

  return (
    <div className="label-row" style={{ display: "flex", width: "100%", height: "100%", alignItems: "stretch" }}>
      <div className="label-left">
        <div className="label-text">
          <div className="label-brand">{BRAND_PRINT_LABEL}</div>
          <div className="label-name">{item.name}</div>
          {item.size ? <div className="label-size">Size: {item.size}</div> : null}
        </div>
      </div>
      <div className="label-right">
        {(format === "QR_CODE" || format === "BOTH") && (
          <canvas ref={qrRef} style={{ width: "30mm", height: "30mm" }} />
        )}
        {(format === "CODE_128" || format === "BOTH") && (
          <svg ref={barcodeRef} className="barcode-svg" />
        )}
      </div>
    </div>
  );
}
