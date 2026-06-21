import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfTableOptions = {
  title: string;
  filename: string;
  headers: string[];
  rows: string[][];
  subtitle?: string;
};

export function downloadTablePdf({ title, subtitle, filename, headers, rows }: PdfTableOptions) {
  if (!rows.length) return;

  const landscape = headers.length > 7;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text(title, 14, 16);

  let startY = 22;
  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, 14, startY);
    startY += 6;
  }

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY,
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [123, 31, 69], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 248, 245] },
    margin: { left: 14, right: 14 },
  });

  const safeName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  doc.save(safeName);
}
