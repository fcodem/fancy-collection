import { BRAND_NAME, BRAND_OWNER } from "./branding";

export type InventoryLabelSize = "compact" | "standard";

export type InventoryLabelData = {
  code: string;
  itemName: string;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  symbolHtml: string;
  labelSize: InventoryLabelSize;
};

export function inventoryLabelDimensions(labelSize: InventoryLabelSize) {
  return labelSize === "compact"
    ? { widthMm: 50, heightMm: 30 }
    : { widthMm: 70, heightMm: 37 };
}

/** Printable, customer-free inventory label document. */
export function buildInventoryLabelDocument(data: InventoryLabelData): string {
  const { widthMm, heightMm } = inventoryLabelDimensions(data.labelSize);
  const compact = data.labelSize === "compact";
  const labelName = escapeHtml(data.itemName || "Inventory item");
  const skuLine = data.sku ? `SKU: ${escapeHtml(data.sku)}` : "";
  const sizeLine = data.size ? `Size: ${escapeHtml(data.size)}` : "";
  const codeLine = escapeHtml(data.code);

  return `<!doctype html>
    <html><head><title>Dress label</title><style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111; }
    .label { width: ${widthMm}mm; height: ${heightMm}mm; padding: 2mm;
      overflow: hidden; display: flex; flex-direction: row; align-items: stretch;
      justify-content: space-between; gap: 1mm; }
    .left { flex: 1 1 50%; min-width: 0; display: flex; flex-direction: column;
      justify-content: center; align-items: flex-start; text-align: left; }
    .right { flex: 0 0 ${compact ? "14mm" : "22mm"}; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 0.4mm; }
    .brand { color: #7B1F45; letter-spacing: 0.3pt; line-height: 1.15; margin-bottom: 0.8mm; }
    .brand-name { font-size: ${compact ? "6pt" : "8pt"}; font-weight: 900; }
    .brand-owner { font-size: ${compact ? "5pt" : "6pt"}; font-weight: 600; margin-top: 0.3mm; }
    .item { font-size: ${compact ? "8pt" : "11pt"}; font-weight: 900;
      line-height: 1.05; display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden; max-width: 100%;
      text-transform: uppercase; word-break: break-word; }
    .size-badge { display: inline-flex; font-size: ${compact ? "7pt" : "9pt"};
      font-weight: 900; border: 1.5pt solid #333; border-radius: 3px;
      padding: 0.3mm 1.5mm; margin-top: 0.8mm; line-height: 1.1; }
    .sku { font-size: ${compact ? "5.5pt" : "7pt"}; font-weight: 700;
      font-family: "Courier New", monospace; color: #333; margin-top: 0.6mm; }
    .code { font-size: ${compact ? "5pt" : "5.5pt"}; margin-top: 0.5mm;
      font-family: "Courier New", monospace; font-weight: 700;
      word-break: break-all; max-width: 20mm; text-align: center; }
    .qr { width: ${compact ? "13mm" : "18mm"};
      height: ${compact ? "13mm" : "18mm"}; max-width: 18mm; max-height: 18mm;
      image-rendering: pixelated; }
    svg { width: ${compact ? "22mm" : "28mm"};
      height: ${compact ? "8mm" : "10mm"}; }
    @media screen { body { background:#eee; padding:20px; }
      .label { background:#fff; margin:auto; box-shadow:0 2px 12px #999; } }
    </style></head><body><div class="label">
      <div class="left">
        <div class="brand">
          <div class="brand-name">${escapeHtml(BRAND_NAME)}</div>
          <div class="brand-owner">by ${escapeHtml(BRAND_OWNER)}</div>
        </div>
        <div class="item">${labelName}</div>
        <div class="size-badge">SIZE ${data.size ? escapeHtml(data.size) : "—"}</div>
        ${skuLine ? `<div class="sku">${skuLine}</div>` : ""}
      </div>
      <div class="right">
        ${data.symbolHtml}
        <div class="code">${codeLine}</div>
      </div>
    </div><script>window.onload=()=>{window.focus();window.print();}</script>
    </body></html>`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
