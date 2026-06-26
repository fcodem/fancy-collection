"use client";

import type { CSSProperties } from "react";
import { downloadTablePdf, type PdfTableOptions } from "@/lib/exportTablePdf";
import { pdfDataFromTable } from "@/lib/pdfTableExtract";
import type { PdfWarningPanel } from "@/lib/pdfWarningDraw";

type Props = {
  title: string;
  filename: string;
  subtitle?: string;
  headers?: string[];
  rows?: string[][];
  warningsBelow?: (PdfWarningPanel[] | undefined)[];
  tableId?: string;
  excludeLastColumn?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  size?: "sm" | "md";
  label?: string;
};

export default function DownloadPdfButton({
  title,
  filename,
  subtitle,
  headers,
  rows,
  warningsBelow,
  tableId,
  excludeLastColumn = true,
  disabled,
  className = "btn btn-outline",
  style,
  size = "md",
  label = "Download PDF",
}: Props) {
  const sizeClass = size === "sm" ? " btn-sm" : "";
  const noData = rows ? rows.length === 0 : false;

  function handleClick() {
    let pdfHeaders = headers;
    let pdfRows = rows;

    if (tableId) {
      const table = document.getElementById(tableId) as HTMLTableElement | null;
      if (!table) return;
      const extracted = pdfDataFromTable(table, excludeLastColumn);
      pdfHeaders = extracted.headers;
      pdfRows = extracted.rows;
    }

    if (!pdfHeaders?.length || !pdfRows?.length) return;

    const opts: PdfTableOptions = {
      title,
      filename,
      subtitle,
      headers: pdfHeaders,
      rows: pdfRows,
      warningsBelow,
    };
    downloadTablePdf(opts);
  }

  return (
    <button
      type="button"
      className={`${className}${sizeClass}`}
      onClick={handleClick}
      disabled={disabled || noData}
      title={noData ? "No data to export" : undefined}
      style={style}
    >
      <i className="fa-solid fa-file-pdf" style={{ marginRight: 6 }} />
      {label}
    </button>
  );
}
