import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { activeBookingWhere } from "@/lib/bookingActiveStatus";
import { requireOwner, isResponse } from "@/lib/api";
import { BRAND_FULL_NAME } from "@/lib/branding";
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType, HeadingLevel, BorderStyle,
  ShadingType,
} from "docx";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function inr(n: number) {
  return `Rs ${n.toLocaleString("en-IN")}`;
}

function cell(text: string, bold = false, shade = false) {
  return new TableCell({
    shading: shade ? { type: ShadingType.SOLID, color: "7B1F45", fill: "7B1F45" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            bold,
            size: shade ? 20 : 18,
            color: shade ? "FFFFFF" : "2D2D2D",
            font: "Arial",
          }),
        ],
      }),
    ],
  });
}

function headerRow(cols: string[]) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((c) => cell(c, true, true)),
  });
}

function dataRow(cols: string[], alt = false) {
  return new TableRow({
    children: cols.map((c) => {
      return new TableCell({
        shading: alt ? { type: ShadingType.SOLID, color: "F9F4F7", fill: "F9F4F7" } : undefined,
        margins: { top: 55, bottom: 55, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: c, size: 17, font: "Arial", color: "2D2D2D" })],
          }),
        ],
      });
    }),
  });
}

function borderlessTable(rows: TableRow[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: "C9A846" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "C9A846" },
      left:   { style: BorderStyle.SINGLE, size: 4, color: "C9A846" },
      right:  { style: BorderStyle.SINGLE, size: 4, color: "C9A846" },
      insideHorizontal:{ style: BorderStyle.SINGLE, size: 2, color: "E8DBF0" },
      insideVertical:{ style: BorderStyle.SINGLE, size: 2, color: "E8DBF0" },
    },
    rows,
  });
}

function titlePara(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, color: "7B1F45", font: "Playfair Display" })],
  });
}

function subPara(text: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text, size: 20, color: "666666", font: "Arial" })],
  });
}

function gap() {
  return new Paragraph({ text: "", spacing: { after: 200 } });
}

const BOOKING_COLS = ["S.No", "Serial#", "Customer", "Contact", "Venue", "Delivery Date", "Return Date", "Dresses", "Rent (₹)", "Advance (₹)", "Remaining (₹)", "Status"];

function bookingRow(b: {
  monthlySerial: number;
  customerName: string;
  contact1: string;
  venue: string | null;
  deliveryDate: Date;
  returnDate: Date;
  bookingItems: { dressName: string }[];
  dressName?: string | null;
  totalPrice: number;
  totalAdvance: number;
  totalRemaining: number;
  status: string;
}, idx: number, alt: boolean) {
  const dresses = b.bookingItems.length ? b.bookingItems.map(i => i.dressName).join(", ") : (b.dressName || "—");
  return dataRow([
    String(idx + 1),
    `#${String(b.monthlySerial).padStart(2, "0")}`,
    b.customerName,
    b.contact1,
    b.venue || "—",
    fmtDate(b.deliveryDate),
    fmtDate(b.returnDate),
    dresses,
    inr(b.totalPrice),
    inr(b.totalAdvance),
    inr(b.totalRemaining),
    b.status.toUpperCase(),
  ], alt);
}

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const type = req.nextUrl.searchParams.get("type") || "all";
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let bookings: Awaited<ReturnType<typeof prisma.booking.findMany<{ include: { bookingItems: true } }>>>;
  let title: string;
  let subtitle: string;
  let filename: string;

  if (type === "delivered") {
    bookings = await prisma.booking.findMany({
      where: { status: "delivered" },
      include: { bookingItems: true },
      orderBy: { deliveredAt: "desc" },
    });
    title = "Delivered Bookings Report";
    subtitle = `Dresses currently out for delivery · Generated ${fmtDate(now)}`;
    filename = `delivered-bookings-${now.toISOString().slice(0, 10)}.docx`;
  } else if (type === "upcoming") {
    bookings = await prisma.booking.findMany({
      where: {
        status: "booked",
        deliveryDate: { gte: today },
      },
      include: { bookingItems: true },
      orderBy: { deliveryDate: "asc" },
    });
    title = "Upcoming Deliveries Report";
    subtitle = `Bookings scheduled to be delivered from today · Generated ${fmtDate(now)}`;
    filename = `upcoming-deliveries-${now.toISOString().slice(0, 10)}.docx`;
  } else {
    bookings = await prisma.booking.findMany({
      where: activeBookingWhere(),
      include: { bookingItems: true },
      orderBy: [{ deliveryDate: "desc" }, { id: "desc" }],
    });
    title = "All Bookings Report";
    subtitle = `Complete booking records · Generated ${fmtDate(now)}`;
    filename = `all-bookings-${now.toISOString().slice(0, 10)}.docx`;
  }

  const tableRows = [
    headerRow(BOOKING_COLS),
    ...bookings.map((b, i) => bookingRow(b, i, i % 2 === 1)),
  ];

  const totalRent = bookings.reduce((s, b) => s + b.totalPrice, 0);
  const totalAdv  = bookings.reduce((s, b) => s + b.totalAdvance, 0);
  const totalRem  = bookings.reduce((s, b) => s + b.totalRemaining, 0);

  const summaryRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 8,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: { type: ShadingType.SOLID, color: "F5E9F0", fill: "F5E9F0" },
        children: [new Paragraph({ children: [new TextRun({ text: `TOTAL (${bookings.length} records)`, bold: true, size: 19, color: "7B1F45", font: "Arial" })] })],
      }),
      new TableCell({
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: { type: ShadingType.SOLID, color: "F5E9F0", fill: "F5E9F0" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: inr(totalRent), bold: true, size: 19, color: "7B1F45", font: "Arial" })] })],
      }),
      new TableCell({
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: { type: ShadingType.SOLID, color: "F5E9F0", fill: "F5E9F0" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: inr(totalAdv), bold: true, size: 19, color: "2E7D32", font: "Arial" })] })],
      }),
      new TableCell({
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: { type: ShadingType.SOLID, color: "F5E9F0", fill: "F5E9F0" },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: inr(totalRem), bold: true, size: 19, color: "C62828", font: "Arial" })] })],
      }),
      new TableCell({
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: { type: ShadingType.SOLID, color: "F5E9F0", fill: "F5E9F0" },
        children: [new Paragraph({ text: "" })],
      }),
    ],
  });
  tableRows.push(summaryRow);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        titlePara(BRAND_FULL_NAME),
        titlePara(title),
        subPara(subtitle),
        gap(),
        borderlessTable(tableRows),
        gap(),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `Generated by: ${user.username}  ·  ${now.toLocaleString("en-IN")}`, size: 16, color: "999999", font: "Arial" })],
        }),
      ],
    }],
  });

  const uint8 = await Packer.toBuffer(doc);
  const buffer = Buffer.from(uint8);

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
