import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import path from "path";
import type { DeliverySlipProps } from "@/components/DeliverySlip";
import type { ReturnSlipProps } from "@/components/ReturnSlip";
import type { IncompleteReturnSlipProps } from "@/components/IncompleteReturnSlip";

const MARGIN = 12;
const PAGE_W = 210;
const GREEN: [number, number, number] = [26, 92, 42];
const GOLD: [number, number, number] = [201, 168, 76];
const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [45, 45, 45];
const GREY: [number, number, number] = [85, 85, 85];
const BLUE: [number, number, number] = [21, 101, 192];
const RED: [number, number, number] = [192, 57, 43];
const AMBER: [number, number, number] = [230, 126, 34];

function fill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function color(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function rs(n: number) {
  return `Rs.${Math.round(n).toLocaleString("en-IN")}`;
}

function drawHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  businessName: string,
  businessPhone: string,
  accent: [number, number, number] = GREEN,
): number {
  fill(doc, accent);
  doc.rect(0, 0, PAGE_W, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  color(doc, WHITE);
  doc.text(businessName, MARGIN, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(businessPhone, MARGIN, 16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, PAGE_W - MARGIN, 10, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(subtitle, PAGE_W - MARGIN, 16, { align: "right" });
  return 34;
}

function drawCustomerBlock(
  doc: jsPDF,
  y: number,
  rows: Array<[string, string]>,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, GREY);
  for (const [label, value] of rows) {
    doc.text(`${label}:`, MARGIN, y);
    doc.setFont("helvetica", "normal");
    color(doc, DARK);
    doc.text(value || "—", MARGIN + 28, y);
    doc.setFont("helvetica", "bold");
    color(doc, GREY);
    y += 5;
  }
  return y + 2;
}

function drawItemsTable(
  doc: jsPDF,
  y: number,
  headers: string[],
  body: string[][],
): number {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [headers],
    body,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 251, 249] },
  });
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
}

function drawFooter(doc: jsPDF, note: string) {
  fill(doc, GREEN);
  doc.rect(0, 283, PAGE_W, 14, "F");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  color(doc, WHITE);
  doc.text(note, PAGE_W / 2, 290, { align: "center" });
}

export async function generateDeliverySlipPdf(
  slip: DeliverySlipProps,
): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const b = slip.booking;
  let y = drawHeader(
    doc,
    "DELIVERY SLIP",
    `#${String(b.monthlySerial).padStart(2, "0")} · ${b.publicBookingId}`,
    slip.businessName,
    slip.businessPhone,
    BLUE,
  );

  if (slip.slipSubtitle) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    color(doc, BLUE);
    doc.text(slip.slipSubtitle, MARGIN, y);
    y += 6;
  }

  const delivered = new Date(b.deliveredAt);
  y = drawCustomerBlock(doc, y, [
    ["Customer", b.customerName],
    ["Contact", b.contact1],
    ["Delivery", `${b.deliveryDate} ${b.deliveryTime}`],
    ["Return due", `${b.returnDate} ${b.returnTime}`],
    ["Delivered at", delivered.toLocaleString("en-IN")],
  ]);

  y = drawItemsTable(
    doc,
    y,
    ["Dress", "Cat.", "Size", "Rent", "Advance", "Balance"],
    slip.items.map((it) => [
      it.dressName,
      it.category,
      it.size,
      rs(it.price),
      rs(it.advance),
      rs(it.remaining),
    ]),
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, DARK);
  doc.text(`Total rent: ${rs(b.totalPrice)}`, MARGIN, y);
  doc.text(`Advance: ${rs(b.totalAdvance)}`, MARGIN + 55, y);
  doc.text(`Collected: ${rs(b.remainingCollected)}`, MARGIN + 95, y);
  doc.text(`Security: ${rs(b.securityCollected)}`, MARGIN + 135, y);
  y += 8;

  if (b.deliveryNotes?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(doc, GREY);
    doc.text(`Notes: ${b.deliveryNotes}`, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 });
  }

  if (slip.qrDataUrl?.startsWith("data:image")) {
    try {
      doc.addImage(slip.qrDataUrl, "PNG", PAGE_W - MARGIN - 22, 250, 22, 22);
    } catch {
      /* skip */
    }
  }

  drawFooter(doc, "Please return all items on time. — Team Fancy Collection");
  return Buffer.from(doc.output("arraybuffer"));
}

export async function generateReturnSlipPdf(
  slip: ReturnSlipProps,
): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const b = slip.booking;
  let y = drawHeader(
    doc,
    "RETURN RECEIPT",
    `#${String(b.monthlySerial).padStart(2, "0")} · ${b.publicBookingId}`,
    slip.businessName,
    slip.businessPhone,
    GREEN,
  );

  if (slip.slipSubtitle) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    color(doc, GREEN);
    doc.text(slip.slipSubtitle, MARGIN, y);
    y += 6;
  }

  y = drawCustomerBlock(doc, y, [
    ["Customer", b.customerName],
    ["Contact", b.contact1],
    ["Scheduled return", `${b.returnDate} ${b.returnTime}`],
    ["Actual return", `${b.actualReturnDate} ${b.actualReturnTime}`],
    ["Status", b.isLateReturn ? "LATE RETURN" : "ON TIME"],
  ]);

  y = drawItemsTable(
    doc,
    y,
    ["Dress", "Cat.", "Size", "Rent", "Condition"],
    slip.items.map((it) => [
      it.dressName,
      it.category,
      it.size,
      rs(it.price),
      it.returnCondition || "Good",
    ]),
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, DARK);
  doc.text(`Rent total: ${rs(b.totalPrice)}`, MARGIN, y);
  doc.text(`Security refunded: ${rs(b.securityRefunded ?? 0)}`, MARGIN + 55, y);
  if ((b.damageCharge ?? 0) > 0) {
    doc.text(`Damage held: ${rs(b.damageCharge ?? 0)}`, MARGIN + 115, y);
  }
  y += 8;

  if (b.returnNotes?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(doc, GREY);
    doc.text(`Notes: ${b.returnNotes}`, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 });
  }

  drawFooter(doc, "Thank you for choosing Team Fancy Collection!");
  return Buffer.from(doc.output("arraybuffer"));
}

export async function generateIncompleteSlipPdf(
  slip: IncompleteReturnSlipProps,
): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const b = slip.booking;
  let y = drawHeader(
    doc,
    "INCOMPLETE RETURN",
    `#${String(b.monthlySerial).padStart(2, "0")} · ${b.publicBookingId}`,
    slip.businessName,
    slip.businessPhone,
    AMBER,
  );

  y = drawCustomerBlock(doc, y, [
    ["Customer", b.customerName],
    ["Contact", b.contact1],
    ["Return due", `${b.returnDate} ${b.returnTime}`],
    ["Reported", `${b.reportedDate || "—"} ${b.reportedTime || ""}`.trim()],
    ["Security held", rs(b.securityHeld)],
  ]);

  if (slip.incompleteItems.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    color(doc, RED);
    doc.text("Items not fully returned / damaged:", MARGIN, y);
    y += 5;
    y = drawItemsTable(
      doc,
      y,
      ["Dress", "Cat.", "Size", "Security held", "Notes"],
      slip.incompleteItems.map((it) => [
        it.dressName,
        it.category,
        it.size,
        rs(it.securityHeld),
        (it.notes || "").slice(0, 60),
      ]),
    );
  }

  if (slip.returnedItems.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    color(doc, GREEN);
    doc.text("Items returned in good condition:", MARGIN, y);
    y += 5;
    y = drawItemsTable(
      doc,
      y,
      ["Dress", "Category", "Size"],
      slip.returnedItems.map((it) => [it.dressName, it.category, it.size]),
    );
  }

  if (b.incompleteNotes?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(doc, GREY);
    doc.text(`Remarks: ${b.incompleteNotes}`, MARGIN, y, { maxWidth: PAGE_W - MARGIN * 2 });
  }

  drawFooter(doc, "Please contact us regarding incomplete items. — Team Fancy Collection");
  return Buffer.from(doc.output("arraybuffer"));
}

async function uploadSlipPdf(
  folder: string,
  filename: string,
  pdfBuffer: Buffer,
): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${folder}/${filename}`, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const { writeFile, mkdir } = await import("fs/promises");
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), pdfBuffer);
  const base =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return `${base}/uploads/${folder}/${encodeURIComponent(filename)}`;
}

export function deliverySlipPdfFilename(publicBookingId: string, suffix = ""): string {
  return `DeliverySlip_${publicBookingId}${suffix}.pdf`;
}

export function returnSlipPdfFilename(publicBookingId: string, suffix = ""): string {
  return `ReturnSlip_${publicBookingId}${suffix}.pdf`;
}

export function incompleteSlipPdfFilename(publicBookingId: string): string {
  return `IncompleteReturn_${publicBookingId}.pdf`;
}

export async function uploadDeliverySlipPdf(pdfBuffer: Buffer, publicBookingId: string, suffix = "") {
  return uploadSlipPdf("delivery-slips", deliverySlipPdfFilename(publicBookingId, suffix), pdfBuffer);
}

export async function uploadReturnSlipPdf(pdfBuffer: Buffer, publicBookingId: string, suffix = "") {
  return uploadSlipPdf("return-slips", returnSlipPdfFilename(publicBookingId, suffix), pdfBuffer);
}

export async function uploadIncompleteSlipPdf(pdfBuffer: Buffer, publicBookingId: string) {
  return uploadSlipPdf("incomplete-slips", incompleteSlipPdfFilename(publicBookingId), pdfBuffer);
}
