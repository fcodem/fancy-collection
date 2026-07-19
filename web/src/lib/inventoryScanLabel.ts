import { BRAND_PRINT_LABEL } from "./branding";

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
  const sizeLine = data.size ? `Size: ${escapeHtml(data.size)}` : "";

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
    .right { flex: 0 0 ${compact ? "14mm" : "30mm"}; display: flex; align-items: center;
      justify-content: center; }
    .brand { font-size: ${compact ? "5pt" : "5.5pt"}; font-weight: 800;
      color: #7B1F45; text-transform: uppercase; letter-spacing: 0.3pt;
      line-height: 1.1; margin-bottom: 0.6mm; }
    .item { font-size: ${compact ? "6pt" : "7pt"}; font-weight: 700;
      line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden; max-width: 100%; }
    .size { font-size: ${compact ? "5.5pt" : "6.5pt"}; margin-top: 0.6mm; }
    .qr { width: ${compact ? "13mm" : "28mm"};
      height: ${compact ? "13mm" : "28mm"}; image-rendering: pixelated; }
    svg { width: ${compact ? "22mm" : "28mm"};
      height: ${compact ? "8mm" : "10mm"}; }
    @media screen { body { background:#eee; padding:20px; }
      .label { background:#fff; margin:auto; box-shadow:0 2px 12px #999; } }
    </style></head><body><div class="label">
      <div class="left">
        <div class="brand">${escapeHtml(BRAND_PRINT_LABEL)}</div>
        <div class="item">${labelName}</div>
        ${sizeLine ? `<div class="size">${sizeLine}</div>` : ""}
      </div>
      <div class="right">${data.symbolHtml}</div>
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
