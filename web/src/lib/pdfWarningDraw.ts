import type { jsPDF } from "jspdf";
import type { BookingWarningRecord } from "@/lib/bookingDetails";
import {
  WARNING_BOOKED_ON_RETURN,
  WARNING_RETURNING_ON_DELIVERY,
} from "@/lib/bookingDetails";
import { pdfCurrency, sanitizePdfText } from "@/lib/pdfFormat";

export type PdfWarningPanel = {
  variant: "returning" | "booked";
  dressLabel?: string;
  w: BookingWarningRecord;
};

const RETURNING_THEME = {
  bg: [255, 248, 225] as [number, number, number],
  border: [255, 224, 130] as [number, number, number],
  accent: [230, 81, 0] as [number, number, number],
  badgeBg: [255, 243, 224] as [number, number, number],
};

const BOOKED_THEME = {
  bg: [255, 245, 245] as [number, number, number],
  border: [245, 198, 203] as [number, number, number],
  accent: [192, 57, 43] as [number, number, number],
  badgeBg: [252, 228, 228] as [number, number, number],
};

type WarningField = { label: string; value: string };

/** Same fields and order as PackingBookingDetailsGrid in BookingWarningPanel. */
export function warningPanelFields(w: BookingWarningRecord): WarningField[] {
  return [
    { label: "Customer", value: w.customer_name || "—" },
    { label: "Address", value: w.customer_address || "—" },
    { label: "Contact", value: w.contact_1 || "—" },
    { label: "WhatsApp", value: w.whatsapp_no || "—" },
    { label: "Venue", value: w.venue || "—" },
    { label: "Staff", value: w.staff_names || "—" },
    { label: "Total Rent", value: pdfCurrency(w.total_rent) },
    { label: "Advance Paid", value: pdfCurrency(w.total_advance) },
    { label: "Dress", value: w.dress_names || "—" },
    { label: "Dress Notes", value: w.item_notes || "—" },
    { label: "Common Note", value: w.common_notes || "—" },
    {
      label: "Delivery",
      value: [w.delivery_date, w.delivery_time].filter(Boolean).join(" ") || "—",
    },
    {
      label: "Return",
      value: [w.return_date, w.return_time].filter(Boolean).join(" ") || "—",
    },
  ];
}

function gridColumns(width: number): number {
  if (width >= 240) return 5;
  if (width >= 180) return 4;
  return 3;
}

function measureFieldHeight(
  doc: jsPDF,
  field: WarningField,
  colWidth: number,
  labelSize: number,
  valueSize: number,
): number {
  doc.setFontSize(labelSize);
  const labelH = 3.2;
  doc.setFontSize(valueSize);
  const valueLines = doc.splitTextToSize(sanitizePdfText(field.value), colWidth - 1);
  return labelH + valueLines.length * 3.2 + 2.5;
}

/** Measure panel height in mm (for autoTable minCellHeight). */
export function measureWarningPanelHeight(
  doc: jsPDF,
  width: number,
  panel: PdfWarningPanel,
): number {
  const pad = 2.5;
  const badgeH = 7.5;
  const fields = warningPanelFields(panel.w);
  const cols = gridColumns(width);
  const colWidth = (width - pad * 2) / cols;
  const labelSize = 5.5;
  const valueSize = 6.5;

  const rowHeights: number[] = [];
  fields.forEach((field, i) => {
    const row = Math.floor(i / cols);
    const h = measureFieldHeight(doc, field, colWidth, labelSize, valueSize);
    rowHeights[row] = Math.max(rowHeights[row] || 0, h);
  });

  const gridH = rowHeights.reduce((sum, h) => sum + h, 0);
  return badgeH + pad + gridH + pad;
}

export function measureWarningPanelsHeight(
  doc: jsPDF,
  width: number,
  panels: PdfWarningPanel[],
): number {
  if (!panels.length) return 0;
  let h = 3;
  panels.forEach((panel, i) => {
    h += measureWarningPanelHeight(doc, width - 4, panel);
    if (i < panels.length - 1) h += 3;
  });
  h += 3;
  return h;
}

/** Draw one warning card matching the website BookingWarningPanel. */
export function drawWarningPanel(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  panel: PdfWarningPanel,
): number {
  const theme = panel.variant === "returning" ? RETURNING_THEME : BOOKED_THEME;
  const pad = 2.5;
  const badgeH = 7.5;
  const accentW = 1.4;
  const fields = warningPanelFields(panel.w);
  const cols = gridColumns(width);
  const colWidth = (width - pad * 2) / cols;
  const labelSize = 5.5;
  const valueSize = 6.5;
  const totalH = measureWarningPanelHeight(doc, width, panel);

  // Card background + border
  doc.setFillColor(...theme.bg);
  doc.setDrawColor(...theme.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, totalH, 2, 2, "FD");

  // Left accent stripe (like border-left: 4px solid)
  doc.setFillColor(...theme.accent);
  doc.rect(x, y + 0.5, accentW, totalH - 1, "F");

  // Badge bar
  doc.setFillColor(...theme.badgeBg);
  doc.rect(x + accentW, y, width - accentW, badgeH, "F");
  doc.setDrawColor(...theme.border);
  doc.setLineWidth(0.15);
  doc.line(x + accentW, y + badgeH, x + width, y + badgeH);

  // Badge text
  const title =
    panel.variant === "returning"
      ? WARNING_RETURNING_ON_DELIVERY
      : WARNING_BOOKED_ON_RETURN;
  const serial = String(panel.w.serial_no).padStart(2, "0");
  const icon = panel.variant === "returning" ? "!" : "o";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...theme.accent);
  doc.text(`${icon}  ${title}  #${serial}`, x + accentW + 3, y + 5);

  // Details grid (packing-details-fit style)
  const rowHeights: number[] = [];
  const fieldHeights: number[] = fields.map((field, i) => {
    const row = Math.floor(i / cols);
    const h = measureFieldHeight(doc, field, colWidth, labelSize, valueSize);
    rowHeights[row] = Math.max(rowHeights[row] || 0, h);
    return h;
  });

  let rowTops: number[] = [];
  let cursorY = y + badgeH + pad;
  for (let r = 0; r < rowHeights.length; r++) {
    rowTops[r] = cursorY;
    cursorY += rowHeights[r];
  }

  fields.forEach((field, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const fx = x + pad + col * colWidth;
    const fy = rowTops[row];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(labelSize);
    doc.setTextColor(110, 95, 88);
    doc.text(field.label.toUpperCase(), fx, fy + 2.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(valueSize);
    doc.setTextColor(45, 38, 35);
    const valueLines = doc.splitTextToSize(sanitizePdfText(field.value), colWidth - 1);
    doc.text(valueLines, fx, fy + 5.8);
  });

  return totalH;
}

export function drawWarningPanels(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  panels: PdfWarningPanel[],
): number {
  let offsetY = y + 2;
  panels.forEach((panel, i) => {
    const h = drawWarningPanel(doc, x + 2, offsetY, width - 4, panel);
    offsetY += h + (i < panels.length - 1 ? 3 : 0);
  });
  return offsetY - y + 2;
}
