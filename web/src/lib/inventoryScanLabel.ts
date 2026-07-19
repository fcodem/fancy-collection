import { BRAND_FULL_NAME } from "./branding";

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
    : { widthMm: 70, heightMm: 40 };
}

/** Printable, customer-free inventory label document. */
export function buildInventoryLabelDocument(data: InventoryLabelData): string {
  const { widthMm, heightMm } = inventoryLabelDimensions(data.labelSize);
  const compact = data.labelSize === "compact";
  const details = [data.size, data.color].filter(Boolean).map(escapeHtml).join(" · ");
  const labelName = escapeHtml(data.itemName || "Inventory item");
  const labelSku = escapeHtml(data.sku || "");

  return `<!doctype html>
    <html><head><title>Dress label</title><style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111; }
    .label { width: ${widthMm}mm; height: ${heightMm}mm; padding: 2mm;
      overflow: hidden; text-align: center; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: .6mm; }
    .brand { font-size: ${compact ? "7pt" : "9pt"}; font-weight: 800; }
    .item { font-size: ${compact ? "6pt" : "8pt"}; font-weight: 700;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .meta,.human { font-size: ${compact ? "5.5pt" : "7pt"}; }
    .qr { width: ${compact ? "14mm" : "20mm"};
      height: ${compact ? "14mm" : "20mm"}; image-rendering: pixelated; }
    svg { width: ${compact ? "42mm" : "60mm"};
      height: ${compact ? "11mm" : "17mm"}; }
    @media screen { body { background:#eee; padding:20px; }
      .label { background:#fff; margin:auto; box-shadow:0 2px 12px #999; } }
    </style></head><body><div class="label">
      <div class="brand">${escapeHtml(BRAND_FULL_NAME)}</div>
      <div class="item">${labelName}${labelSku ? ` · ${labelSku}` : ""}</div>
      ${details ? `<div class="meta">${details}</div>` : ""}
      ${data.symbolHtml}
      <div class="human">${escapeHtml(data.code)}</div>
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
