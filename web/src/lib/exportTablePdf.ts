import { jsPDF } from "jspdf";
import autoTable, { type CellDef, type RowInput } from "jspdf-autotable";
import {
  isPdfMoneyColumn,
  pdfHeaderLabel,
  sanitizePdfText,
} from "@/lib/pdfFormat";
import type { PdfWarningPanel } from "@/lib/pdfWarningDraw";
import {
  drawWarningPanels,
  measureWarningPanelsHeight,
} from "@/lib/pdfWarningDraw";

export type PdfTableOptions = {
  title: string;
  filename: string;
  headers: string[];
  rows: string[][];
  /** Warning panels drawn below each matching row (website-style cards). */
  warningsBelow?: (PdfWarningPanel[] | undefined)[];
  subtitle?: string;
};

const BRAND = {
  primary: [123, 31, 69] as [number, number, number],
  primaryDark: [92, 22, 52] as [number, number, number],
  cream: [252, 248, 245] as [number, number, number],
  border: [220, 208, 200] as [number, number, number],
  muted: [110, 95, 88] as [number, number, number],
  warnRowBg: [252, 250, 247] as [number, number, number],
};

const COLUMN_WEIGHTS: Record<string, number> = {
  "S.No": 0.42,
  Serial: 0.42,
  Customer: 1.1,
  Address: 1.45,
  Contact: 0.95,
  WhatsApp: 0.95,
  Venue: 1,
  "Total Rent": 0.78,
  Rent: 0.78,
  Advance: 0.78,
  "Balance Left": 0.82,
  Balance: 0.82,
  Remaining: 0.82,
  Security: 0.72,
  Dress: 1.25,
  "Dress Notes": 2.1,
  "Common Note": 1.75,
  Common: 1.75,
  Delivery: 0.95,
  Return: 0.95,
  Status: 0.75,
  "Days Late": 0.7,
  "Missing Notes": 1.7,
  Missing: 1.7,
  "Security Held": 0.78,
  "Sec. Held": 0.78,
  "Returned On": 0.85,
  Returned: 0.85,
  "Delivery Info": 1.45,
  "Deliv. Info": 1.45,
  "Prepared By": 0.85,
  Prepared: 0.85,
  "Checked By": 0.85,
  Checked: 0.85,
  "Packing Note": 1.35,
  "Pack Note": 1.35,
  Ready: 0.5,
};

function pdfFontSize(columnCount: number): number {
  if (columnCount <= 7) return 9;
  if (columnCount <= 11) return 7.5;
  if (columnCount <= 15) return 7;
  return 6.5;
}

function buildColumnStyles(headers: string[], innerWidth: number) {
  const totalWeight = headers.reduce(
    (sum, header) => sum + (COLUMN_WEIGHTS[header.trim()] ?? 1),
    0,
  );
  const styles: Record<number, { cellWidth: number; halign?: "left" | "right" | "center" }> = {};
  headers.forEach((header, index) => {
    const label = header.trim();
    const weight = COLUMN_WEIGHTS[label] ?? 1;
    styles[index] = {
      cellWidth: (weight / totalWeight) * innerWidth,
      halign: isPdfMoneyColumn(label) ? "right" : "left",
    };
  });
  return styles;
}

function sanitizeRows(rows: string[][]): string[][] {
  return rows.map((row) => row.map((cell) => sanitizePdfText(cell)));
}

type WarningRowMeta = { panels: PdfWarningPanel[] };

/** Accept panel arrays (current) or legacy plain strings without throwing. */
function coalesceWarningPanels(entry: unknown): PdfWarningPanel[] | undefined {
  if (entry == null) return undefined;
  if (Array.isArray(entry)) {
    if (!entry.length) return undefined;
    const valid = entry.filter(
      (p): p is PdfWarningPanel =>
        Boolean(p) &&
        typeof p === "object" &&
        "variant" in p &&
        "w" in p,
    );
    return valid.length ? valid : undefined;
  }
  // Legacy: warnings were plain strings — skip (drawn as panels now).
  if (typeof entry === "string") {
    const text = entry.trim();
    return text && text !== "—" ? undefined : undefined;
  }
  return undefined;
}

function buildBodyWithWarnings(
  doc: jsPDF,
  rows: string[][],
  colSpan: number,
  cellWidth: number,
  warningsBelow?: (PdfWarningPanel[] | undefined)[],
): { body: RowInput[]; warningByRow: Map<number, WarningRowMeta> } {
  const body: RowInput[] = [];
  const warningByRow = new Map<number, WarningRowMeta>();
  let bodyRowIndex = 0;

  rows.forEach((row, index) => {
    body.push(row);
    bodyRowIndex++;

    const panels = coalesceWarningPanels(warningsBelow?.[index]);
    if (!panels?.length) return;

    const minH = measureWarningPanelsHeight(doc, cellWidth, panels);
    const warnCell: CellDef = {
      content: "",
      colSpan,
      styles: {
        fillColor: BRAND.warnRowBg,
        minCellHeight: minH,
        cellPadding: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
        lineWidth: 0.1,
        lineColor: BRAND.border,
      },
    };
    body.push([warnCell]);
    warningByRow.set(bodyRowIndex, { panels });
    bodyRowIndex++;
  });

  return { body, warningByRow };
}

export function downloadTablePdf({
  title,
  subtitle,
  filename,
  headers,
  rows,
  warningsBelow,
}: PdfTableOptions) {
  if (!rows.length) return;

  const columnCount = headers.length;
  const landscape = columnCount >= 5;
  const margin = { top: 28, right: 8, bottom: 16, left: 8 };
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const innerWidth = pageWidth - margin.left - margin.right;
  const fontSize = pdfFontSize(columnCount);
  const pdfHeaders = headers.map(pdfHeaderLabel);
  const sanitizedRows = sanitizeRows(rows);
  const { body, warningByRow } = buildBodyWithWarnings(
    doc,
    sanitizedRows,
    pdfHeaders.length,
    innerWidth,
    warningsBelow,
  );

  const generatedAt = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  doc.setFillColor(...BRAND.primaryDark);
  doc.rect(0, 0, pageWidth, 17, "F");
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 17, pageWidth, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, margin.left, 10.5);

  let tableStartY = 22;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(245, 235, 230);
    const subLines = doc.splitTextToSize(subtitle, innerWidth * 0.7);
    doc.text(subLines, margin.left, 15);
    tableStartY = 15 + subLines.length * 3.8 + 5;
  }

  autoTable(doc, {
    head: [pdfHeaders],
    body,
    startY: tableStartY,
    tableWidth: innerWidth,
    margin: { top: 14, right: margin.right, bottom: margin.bottom, left: margin.left },
    styles: {
      fontSize,
      font: "helvetica",
      cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 },
      overflow: "linebreak",
      valign: "top",
      lineWidth: 0.15,
      lineColor: BRAND.border,
      textColor: [45, 38, 35],
    },
    headStyles: {
      fillColor: BRAND.primary,
      textColor: 255,
      fontStyle: "bold",
      fontSize: Math.max(fontSize, 6.5),
      valign: "middle",
      halign: "center",
      cellPadding: { top: 3.5, right: 2, bottom: 3.5, left: 2 },
    },
    bodyStyles: {
      valign: "top",
    },
    alternateRowStyles: { fillColor: BRAND.cream },
    columnStyles: buildColumnStyles(pdfHeaders, innerWidth),
    showHead: "everyPage",
    horizontalPageBreak: columnCount > 10,
    horizontalPageBreakRepeat: columnCount > 10 ? [0, 1] : undefined,
    rowPageBreak: "auto",
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND.muted);
      doc.text(generatedAt, pageWidth - margin.right, pageHeight - 6, { align: "right" });
      doc.text(`Page ${data.pageNumber} of ${pageCount}`, margin.left, pageHeight - 6);
    },
    didParseCell: (data) => {
      const meta = warningByRow.get(data.row.index);
      const isWarningRow = data.section === "body" && Boolean(meta);

      if (isWarningRow) {
        data.cell.text = [];
        data.cell.styles.fillColor = BRAND.warnRowBg;
        return;
      }

      if (data.section === "body" && isPdfMoneyColumn(String(data.column.raw))) {
        data.cell.styles.halign = "right";
      }
      if (typeof data.cell.raw === "string") {
        data.cell.text = [sanitizePdfText(data.cell.raw)];
      }
    },
    didDrawCell: (data) => {
      const meta = warningByRow.get(data.row.index);
      if (data.section !== "body" || !meta) return;

      drawWarningPanels(
        doc,
        data.cell.x,
        data.cell.y,
        data.cell.width,
        meta.panels,
      );
    },
  });

  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  doc.save(safeName);
}
