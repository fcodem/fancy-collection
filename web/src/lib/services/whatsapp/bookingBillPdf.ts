import jsPDF from "jspdf";
import { readFile } from "fs/promises";
import path from "path";
import { loadSlipLogoDataUrl } from "./slipLogoData.server";
import { SLIP_TAGLINE, SLIP_MOTTO } from "@/lib/slipConstants";

export type BookingBillPdfInput = {
  booking: {
    publicBookingId: string;
    customerName: string;
    customerAddress: string;
    contact1: string;
    whatsappNo: string;
    deliveryDate: string;
    deliveryTime: string;
    returnDate: string;
    returnTime: string;
    venue: string | null;
    staffNames: string | null;
    securityDeposit: number;
    totalPrice: number;
    totalAdvance: number;
    totalRemaining: number;
    commonNotes: string | null;
    monthlySerial: number;
  };
  items: Array<{
    dressName: string;
    category: string;
    size: string;
    price: number;
    advance: number;
    remaining: number;
    notes: string | null;
    imageUrl: string | null;
  }>;
  qrDataUrl: string;
  businessName: string;
  businessPhone: string;
  businessAddress?: string;
  isReturned?: boolean;
  actualReturnDate?: string;
  actualReturnTime?: string;
  securityRefunded?: number;
  lateFee?: number;
  damageCharge?: number;
  remainingCollected?: number;
  returnNotes?: string | null;
};

const MARGIN = 12;
const PAGE_W = 210;
const PAGE_H = 297;
const WORK_W = PAGE_W - MARGIN * 2;

// Color palette
const GREEN: [number, number, number] = [26, 92, 42];
const GREEN_LIGHT: [number, number, number] = [45, 138, 69];
const GOLD: [number, number, number] = [201, 168, 76];
const RED: [number, number, number] = [192, 57, 43];
const RED_LIGHT: [number, number, number] = [231, 76, 60];
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_GREEN: [number, number, number] = [240, 250, 243];
const DARK_GREY: [number, number, number] = [26, 26, 26];
const MID_GREY: [number, number, number] = [85, 85, 85];
const PALE_GREY: [number, number, number] = [153, 153, 153];
const SUCCESS: [number, number, number] = [39, 174, 96];
const BLUE: [number, number, number] = [41, 128, 185];
const ROW_ALT: [number, number, number] = [249, 251, 249];
const BORDER: [number, number, number] = [224, 224, 224];

function fill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function draw(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}
function color(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function rs(n: number) {
  return `Rs.${Math.round(n).toLocaleString("en-IN")}`;
}
const DEFAULT_ADDRESS = "Banwata Ganj Near Balaji Mandir Court Road Moradabad 244001";
const DEFAULT_PHONE = "8077843874, 8630834711";
const GSTIN = "09BJZPA3417L1ZQ";
const GST_RATE = 18;

function padSerial(n: number) {
  return String(n).padStart(2, "0");
}

type PdfImageFmt = "JPEG" | "PNG" | "WEBP";

function imageFormatFromUrl(imageUrl: string): PdfImageFmt {
  const urlLower = imageUrl.toLowerCase();
  if (urlLower.includes(".png")) return "PNG";
  if (urlLower.includes(".webp")) return "WEBP";
  return "JPEG";
}

async function loadDressImageForPdf(
  imageUrl: string,
): Promise<{ base64: string; fmt: PdfImageFmt } | null> {
  try {
    let buffer: Buffer;
    if (imageUrl.startsWith("/uploads/") || imageUrl.startsWith("uploads/")) {
      const rel = imageUrl.replace(/^\//, "");
      buffer = await readFile(path.join(process.cwd(), "public", rel));
    } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      const res = await fetch(imageUrl);
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      return null;
    }
    return { base64: buffer.toString("base64"), fmt: imageFormatFromUrl(imageUrl) };
  } catch {
    return null;
  }
}

async function prefetchDressImages(items: BookingBillPdfInput["items"]) {
  const withUrls = items.filter((item) => item.imageUrl);
  const pairs = await Promise.all(
    withUrls.map(async (item) => {
      const loaded = await loadDressImageForPdf(item.imageUrl!);
      return { item, loaded };
    }),
  );
  return pairs;
}

/** Fallback brand monogram when the logo asset cannot be embedded. */
function drawMonogram(doc: jsPDF, initials: string, marginX: number, _gold: unknown): void {
  draw(doc, GOLD);
  doc.setLineWidth(0.7);
  doc.circle(marginX + 9, 15, 9, "D");
  color(doc, GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(initials, marginX + 9, 18, { align: "center" });
}

export async function generateBookingBillPdf(input: BookingBillPdfInput): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const b = input.booking;
  const slipNo = padSerial(b.monthlySerial);
  const biz = input.businessName;
  const bizPhone = input.businessPhone?.trim() || DEFAULT_PHONE;
  const bizAddress = input.businessAddress?.trim() || DEFAULT_ADDRESS;
  const initials = biz.charAt(0).toUpperCase();
  let y = 0;

  const HEADER_H = 45;

  // ═══════════════════════════════════════════════════
  // SECTION 1: HEADER
  // ═══════════════════════════════════════════════════

  fill(doc, GREEN);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  fill(doc, GREEN_LIGHT);
  doc.rect(PAGE_W / 2, 0, PAGE_W / 2, HEADER_H, "F");

  const logoDataUrl = await loadSlipLogoDataUrl();
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", MARGIN, 6, 18, 18);
    } catch {
      drawMonogram(doc, initials, MARGIN, GOLD);
    }
  } else {
    drawMonogram(doc, initials, MARGIN, GOLD);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  color(doc, WHITE);
  doc.text(biz, MARGIN + 22, 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  color(doc, [230, 245, 235]);
  doc.text(`GSTIN: ${GSTIN}`, MARGIN + 22, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  color(doc, [230, 245, 235]);
  const addrLines = doc.splitTextToSize(bizAddress, 95) as string[];
  doc.text(addrLines, MARGIN + 22, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  color(doc, GOLD);
  doc.text(bizPhone, MARGIN + 22, 18 + addrLines.length * 3.5 + 2);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  color(doc, GOLD);
  doc.text(`${SLIP_TAGLINE} · ${SLIP_MOTTO}`, MARGIN + 22, HEADER_H - 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  color(doc, WHITE);
  doc.text("BOOKING SLIP", PAGE_W - MARGIN, 10, { align: "right" });

  doc.setFontSize(14);
  color(doc, GOLD);
  doc.text(`Slip #${slipNo}`, PAGE_W - MARGIN, 18, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  color(doc, WHITE);
  doc.text(b.publicBookingId, PAGE_W - MARGIN, 24, { align: "right" });

  y = HEADER_H;

  // Gold divider line
  fill(doc, GOLD);
  doc.rect(0, y, PAGE_W, 1.2, "F");
  y += 1.5;

  // ═══════════════════════════════════════════════════
  // SECTION 2: CUSTOMER DETAILS + DATE BAND
  // ═══════════════════════════════════════════════════

  const SEC2_Y = y + 3;
  const LEFT_W = 96;
  const RIGHT_W = WORK_W - LEFT_W - 4;
  const RIGHT_X = MARGIN + LEFT_W + 4;

  // Customer card (light green bg)
  fill(doc, LIGHT_GREEN);
  draw(doc, GREEN);
  doc.setLineWidth(0);
  doc.rect(MARGIN, SEC2_Y, LEFT_W, 48, "F");
  doc.setLineWidth(1.2);
  doc.line(MARGIN, SEC2_Y, MARGIN, SEC2_Y + 48);
  doc.setLineWidth(0);

  // Customer label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  color(doc, GREEN);
  doc.text("CUSTOMER DETAILS", MARGIN + 3, SEC2_Y + 5);

  const customerRows: [string, string][] = [
    ["Name", b.customerName],
    ["Address", b.customerAddress],
    ["Contact", b.contact1],
    ...(b.whatsappNo ? [["WhatsApp", b.whatsappNo] as [string, string]] : []),
    ["Venue", b.venue || "—"],
    ["Staff", b.staffNames || "—"],
  ];

  let cy = SEC2_Y + 11;
  for (const [label, value] of customerRows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    color(doc, MID_GREY);
    doc.text(`${label}:`, MARGIN + 3, cy);
    doc.setFont("helvetica", label === "Name" ? "bold" : "normal");
    doc.setFontSize(label === "Name" ? 9 : 8);
    color(doc, label === "Name" ? DARK_GREY : [80, 80, 80]);
    const val = doc.splitTextToSize(value, LEFT_W - 22) as string[];
    doc.text(val, MARGIN + 22, cy);
    cy += label === "Name" ? 8 : 6 + (val.length - 1) * 4;
    if (cy > SEC2_Y + 46) break;
  }

  // Pickup sub-card (dark green)
  const CARD_H = 22;
  fill(doc, GREEN);
  doc.rect(RIGHT_X, SEC2_Y, RIGHT_W, CARD_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  color(doc, [200, 230, 205]);
  doc.text("📦  PICKUP DATE & TIME", RIGHT_X + 3, SEC2_Y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  color(doc, WHITE);
  doc.text(b.deliveryDate, RIGHT_X + 3, SEC2_Y + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  color(doc, GOLD);
  doc.text(b.deliveryTime, RIGHT_X + 3, SEC2_Y + 20);

  // Return sub-card (gold)
  const RETURN_Y = SEC2_Y + CARD_H + 4;
  fill(doc, GOLD);
  doc.rect(RIGHT_X, RETURN_Y, RIGHT_W, CARD_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  color(doc, [90, 56, 0]);
  doc.text("🔄  RETURN DATE & TIME", RIGHT_X + 3, RETURN_Y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  color(doc, GREEN);
  doc.text(b.returnDate, RIGHT_X + 3, RETURN_Y + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  color(doc, GREEN);
  doc.text(b.returnTime, RIGHT_X + 3, RETURN_Y + 20);

  y = SEC2_Y + 52;

  // ═══════════════════════════════════════════════════
  // SECTION 3: ITEMS TABLE
  // ═══════════════════════════════════════════════════

  y += 4;

  // Section label
  fill(doc, GREEN);
  doc.rect(MARGIN, y, 2, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  color(doc, GREEN);
  doc.text("BOOKED ITEMS", MARGIN + 4, y + 4);
  y += 8;

  const COL: Array<{ label: string; w: number; x: number; align?: "right" | "center" }> = [
    { label: "#", w: 7, x: 0, align: "center" },
    { label: "Item Name", w: 56, x: 7 },
    { label: "Category", w: 28, x: 63 },
    { label: "Size", w: 18, x: 91 },
    { label: "Price", w: 22, x: 109, align: "right" },
    { label: "Advance", w: 22, x: 131, align: "right" },
    { label: "Balance", w: 21, x: 153, align: "right" },
  ];
  const ROW_H = 6.5;

  // Header
  fill(doc, GREEN);
  doc.rect(MARGIN, y, WORK_W, ROW_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  color(doc, WHITE);
  for (const col of COL) {
    const tx = MARGIN + col.x + (col.align === "right" ? col.w - 1 : 1);
    doc.text(col.label, tx, y + 4.5, { align: col.align ?? "left" });
  }
  y += ROW_H;

  const items = input.items;
  for (let i = 0; i < items.length; i++) {
    if (y + ROW_H > PAGE_H - 60) {
      doc.addPage();
      y = MARGIN;
    }
    if (i % 2 === 1) {
      fill(doc, ROW_ALT);
      doc.rect(MARGIN, y, WORK_W, ROW_H, "F");
    }
    const item = items[i];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(doc, DARK_GREY);

    const rowVals = [
      String(i + 1),
      item.dressName,
      item.category || "—",
      item.size || "—",
      rs(item.price),
      rs(item.advance),
      rs(item.remaining),
    ];

    for (let c = 0; c < COL.length; c++) {
      const col = COL[c];
      const tx = MARGIN + col.x + (col.align === "right" ? col.w - 1 : 1);
      const txt = doc.splitTextToSize(rowVals[c] || "—", col.w - 2)[0] as string;
      if (c === 6 && item.remaining > 0) {
        color(doc, [217, 119, 6]);
        doc.setFont("helvetica", "bold");
      } else if (c === 5) {
        color(doc, SUCCESS);
      } else {
        color(doc, DARK_GREY);
        doc.setFont("helvetica", c === 1 ? "bold" : "normal");
      }
      doc.text(txt, tx, y + 4.5, { align: col.align ?? "left" });
    }

    // Row border
    draw(doc, BORDER);
    doc.setLineWidth(0.1);
    doc.line(MARGIN, y + ROW_H, MARGIN + WORK_W, y + ROW_H);

    y += ROW_H;
  }

  // Totals row
  fill(doc, LIGHT_GREEN);
  doc.rect(MARGIN, y, WORK_W, ROW_H, "F");
  draw(doc, GREEN);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, MARGIN + WORK_W, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  color(doc, GREEN);
  doc.text("TOTAL", MARGIN + 1, y + 4.5);
  color(doc, DARK_GREY);
  doc.text(rs(b.totalPrice), MARGIN + COL[4].x + COL[4].w - 1, y + 4.5, { align: "right" });
  color(doc, SUCCESS);
  doc.text(rs(b.totalAdvance), MARGIN + COL[5].x + COL[5].w - 1, y + 4.5, { align: "right" });
  color(doc, b.totalRemaining > 0 ? RED : GREEN);
  doc.text(rs(b.totalRemaining), MARGIN + COL[6].x + COL[6].w - 1, y + 4.5, { align: "right" });

  doc.setLineWidth(0);
  y += ROW_H + 4;

  const inclusiveRent = b.totalPrice;
  const taxableAmount = Math.round(inclusiveRent / (1 + GST_RATE / 100));
  const gstAmount = inclusiveRent - taxableAmount;
  const cgstAmount = Math.round(gstAmount / 2);
  const sgstAmount = gstAmount - cgstAmount;

  // ═══════════════════════════════════════════════════
  // SECTION 4: PAYMENT SUMMARY + QR CODE
  // ═══════════════════════════════════════════════════

  if (y + 56 > PAGE_H - 55) {
    doc.addPage();
    y = MARGIN;
  }

  const QR_SIZE = 50;
  const QR_X = MARGIN;
  const PAY_X = MARGIN + QR_SIZE + 6;
  const PAY_W = WORK_W - QR_SIZE - 6;
  const PAY_BOX_H = 82;

  // QR Code
  try {
    doc.addImage(input.qrDataUrl, "PNG", QR_X, y, QR_SIZE, QR_SIZE);
  } catch {
    // skip if QR invalid
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  color(doc, GREEN);
  doc.text("🔒 CONFIRMED ✓", QR_X + QR_SIZE / 2, y + QR_SIZE + 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  color(doc, PALE_GREY);
  doc.text("Scan for instant verification", QR_X + QR_SIZE / 2, y + QR_SIZE + 8, { align: "center" });

  // Payment Summary box
  // Gold border
  draw(doc, GOLD);
  doc.setLineWidth(0.7);
  doc.rect(PAY_X, y, PAY_W, PAY_BOX_H, "D");
  doc.setLineWidth(0);

  // Header strip
  fill(doc, GREEN);
  doc.rect(PAY_X, y, PAY_W, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  color(doc, WHITE);
  doc.text("PAYMENT SUMMARY", PAY_X + PAY_W / 2, y + 5.5, { align: "center" });

  let py = y + 12;

  // Total Rental
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  color(doc, MID_GREY);
  doc.text(`Total Rental (Incl. GST @ ${GST_RATE}%)`, PAY_X + 3, py);
  doc.setFont("helvetica", "bold");
  color(doc, DARK_GREY);
  doc.text(rs(inclusiveRent), PAY_X + PAY_W - 2, py, { align: "right" });
  py += 8;

  // Advance Paid
  doc.setFont("helvetica", "normal");
  color(doc, MID_GREY);
  doc.text("Advance Paid", PAY_X + 3, py);
  doc.setFont("helvetica", "bold");
  color(doc, SUCCESS);
  doc.text(`${rs(b.totalAdvance)}  PAID ✓`, PAY_X + PAY_W - 2, py, { align: "right" });
  py += 6;

  // Balance Due — red background
  fill(doc, RED);
  doc.rect(PAY_X, py, PAY_W, 14, "F");
  fill(doc, RED_LIGHT);
  doc.rect(PAY_X + PAY_W / 2, py, PAY_W / 2, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  color(doc, [255, 220, 220]);
  doc.text("AMOUNT TO BRING ON PICKUP DAY", PAY_X + 3, py + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  color(doc, WHITE);
  doc.text(rs(b.totalRemaining), PAY_X + PAY_W - 2, py + 12, { align: "right" });
  py += 14;

  // Security Amount — same highlighted style
  fill(doc, RED);
  doc.rect(PAY_X, py, PAY_W, 16, "F");
  fill(doc, RED_LIGHT);
  doc.rect(PAY_X + PAY_W / 2, py, PAY_W / 2, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  color(doc, [255, 220, 220]);
  doc.text("SECURITY AMOUNT TO BRING ON PICKUP DAY", PAY_X + 3, py + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  color(doc, WHITE);
  doc.text(rs(b.securityDeposit), PAY_X + PAY_W - 2, py + 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  color(doc, [255, 230, 230]);
  doc.text("Refundable on return in original condition", PAY_X + 3, py + 15);
  py += 16;

  // GST Billing — 2 lines (inclusive, below security)
  fill(doc, LIGHT_GREEN);
  doc.rect(PAY_X, py, PAY_W, 14, "F");
  draw(doc, GREEN);
  doc.setLineWidth(0.3);
  doc.line(PAY_X, py, PAY_X + PAY_W, py);
  doc.setLineWidth(0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  color(doc, GREEN);
  doc.text("GST BILLING DETAILS (INCLUSIVE)", PAY_X + PAY_W / 2, py + 3.5, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  color(doc, DARK_GREY);
  const gstLine1 = doc.splitTextToSize(
    `Rent ${rs(inclusiveRent)} incl. GST @ ${GST_RATE}% — Taxable: ${rs(taxableAmount)} | GST: ${rs(gstAmount)}`,
    PAY_W - 4,
  ) as string[];
  doc.text(gstLine1, PAY_X + PAY_W / 2, py + 7.5, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  color(doc, GREEN);
  doc.text(
    `CGST @ 9%: ${rs(cgstAmount)}  •  SGST @ 9%: ${rs(sgstAmount)}`,
    PAY_X + PAY_W / 2,
    py + 12,
    { align: "center" },
  );

  y = Math.max(y + QR_SIZE + 12, y + PAY_BOX_H + 4);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  color(doc, MID_GREY);
  doc.text(
    "Please bring exact change for balance and security amounts shown above.",
    PAGE_W - MARGIN,
    y,
    { align: "right" },
  );
  y += 5;

  // ═══════════════════════════════════════════════════
  // SECTION 6: TERMS & CONDITIONS
  // ═══════════════════════════════════════════════════

  if (y + 50 > PAGE_H - 22) {
    doc.addPage();
    y = MARGIN;
  }

  // NO CANCELLATION banner
  fill(doc, RED);
  doc.rect(MARGIN, y, WORK_W, 12, "F");
  fill(doc, RED_LIGHT);
  doc.rect(MARGIN + WORK_W / 2, y, WORK_W / 2, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, WHITE);
  doc.text("NO CANCELLATION · NO REFUND", PAGE_W / 2, y + 5, { align: "center" });
  doc.setFontSize(7);
  color(doc, [255, 230, 230]);
  doc.text(
    "All bookings are final. Advance is non-refundable and non-adjustable.",
    PAGE_W / 2,
    y + 9.5,
    { align: "center" },
  );
  y += 15;

  const centerX = PAGE_W / 2;
  const lineY = y + 3;
  draw(doc, BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, lineY, centerX - 28, lineY);
  doc.line(centerX + 28, lineY, MARGIN + WORK_W, lineY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, GREEN);
  doc.text("TERMS & CONDITIONS", centerX, lineY + 1, { align: "center" });
  y += 8;
  doc.setLineWidth(0);

  const TERMS = [
    "Goods once booked CANNOT be cancelled under any circumstances.",
    "Booking advance amount is NOT adjustable in any other bookings.",
    "All items must be returned by the return date and time mentioned above.",
    "Late returns will attract additional rental charges per day.",
    "Any damage, stains, tears or loss to the rented items is chargeable.",
    "Security deposit refunded ONLY upon return of all items in original condition.",
    "Items handed to registered customer with valid photo ID only.",
    "Team Fancy Collection not responsible for alterations done outside our premises.",
    "In case of any dispute, the decision of management shall be final.",
    "Customer is responsible for proper storage and care during rental period.",
  ];

  const half = Math.ceil(TERMS.length / 2);
  const termsLeft = TERMS.slice(0, half);
  const termsRight = TERMS.slice(half);
  const colW = WORK_W / 2 - 4;

  const drawTerm = (text: string, num: number, x: number, termY: number): number => {
    const lines = doc.splitTextToSize(`${num}. ${text}`, colW - 4) as string[];
    const boxH = lines.length * 3.8 + 3;
    fill(doc, [255, 248, 225]);
    draw(doc, [240, 192, 64]);
    doc.setLineWidth(0.2);
    doc.rect(x, termY - 2.5, colW, boxH, "FD");
    doc.setLineWidth(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    color(doc, DARK_GREY);
    doc.text(lines, x + 2, termY);
    return termY + boxH + 1.5;
  };

  let lY = y;
  let rY = y;
  for (let i = 0; i < Math.max(termsLeft.length, termsRight.length); i++) {
    if (termsLeft[i]) lY = drawTerm(termsLeft[i], i + 1, MARGIN, lY);
    if (termsRight[i]) rY = drawTerm(termsRight[i], half + i + 1, MARGIN + colW + 8, rY);
  }
  y = Math.max(lY, rY) + 4;

  // ═══════════════════════════════════════════════════
  // SECTION 7: FOOTER
  // ═══════════════════════════════════════════════════

  const footerY = PAGE_H - 14;

  // Gold divider
  fill(doc, GOLD);
  doc.rect(0, footerY - 1.5, PAGE_W, 1.2, "F");

  // Green footer band
  fill(doc, GREEN);
  doc.rect(0, footerY, PAGE_W, 10, "F");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  color(doc, WHITE);
  doc.text(`Thank you for choosing ${biz}!`, MARGIN, footerY + 6.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  color(doc, [200, 230, 205]);
  doc.text(bizPhone, PAGE_W - MARGIN, footerY + 4.5, { align: "right" });
  const footAddr = doc.splitTextToSize(bizAddress, 90) as string[];
  doc.text(footAddr, PAGE_W - MARGIN, footerY + 8, { align: "right" });

  // Computer generated note
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  color(doc, PALE_GREY);
  doc.text("This is a computer-generated booking slip.", PAGE_W / 2, PAGE_H - 2, {
    align: "center",
  });

  // ═══════════════════════════════════════════════════
  // PAGES 2+: ONE PAGE PER DRESS IMAGE (prefetched in parallel)
  // ═══════════════════════════════════════════════════

  const dressImages = await prefetchDressImages(input.items);

  for (const { item, loaded } of dressImages) {
    doc.addPage();

    fill(doc, GREEN);
    doc.rect(0, 0, PAGE_W, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    color(doc, WHITE);
    doc.text(item.dressName, PAGE_W / 2, 8, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(doc, GOLD);
    doc.text(`${item.category || ""} · Size: ${item.size || "—"} · ${rs(item.price)}`, PAGE_W / 2, 14, { align: "center" });

    let imageAdded = false;
    if (loaded) {
      try {
        doc.addImage(loaded.base64, loaded.fmt, 40, 24, 130, 160);
        imageAdded = true;
      } catch {
        // skip bad image data
      }
    }

    if (!imageAdded) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(12);
      color(doc, PALE_GREY);
      doc.text("[Image not available]", PAGE_W / 2, 110, { align: "center" });
    }

    if (item.notes) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      color(doc, MID_GREY);
      const noteTxt = doc.splitTextToSize(`Notes: ${item.notes}`, WORK_W) as string[];
      doc.text(noteTxt, MARGIN, 192);
    }

    fill(doc, GREEN);
    doc.rect(0, PAGE_H - 12, PAGE_W, 12, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(doc, WHITE);
    doc.text(`${biz} — Booking ${b.publicBookingId}`, MARGIN, PAGE_H - 5);
    doc.text(input.businessPhone, PAGE_W - MARGIN, PAGE_H - 5, { align: "right" });
  }

  if (input.isReturned) {
    drawReturnReceiptPage(doc, input);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

function drawReturnReceiptPage(doc: jsPDF, input: BookingBillPdfInput) {
  doc.addPage();
  const b = input.booking;
  const biz = "Team Fancy Collection";
  let y = MARGIN;

  fill(doc, GREEN);
  doc.rect(0, 0, PAGE_W, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  color(doc, WHITE);
  doc.text("RETURN RECEIPT", PAGE_W / 2, 12, { align: "center" });
  doc.setFontSize(9);
  color(doc, GOLD);
  doc.text(`${biz} — ${b.publicBookingId}`, PAGE_W / 2, 20, { align: "center" });

  y = 36;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  color(doc, GREEN);
  doc.text(`Thank You, ${b.customerName}!`, PAGE_W / 2, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  color(doc, MID_GREY);
  const thanks =
    "Your booking has been successfully returned and settled. Team Fancy Collection is grateful for your trust and patronage.";
  const thanksLines = doc.splitTextToSize(thanks, WORK_W) as string[];
  doc.text(thanksLines, PAGE_W / 2, y, { align: "center" });
  y += thanksLines.length * 4.5 + 6;

  fill(doc, SUCCESS);
  doc.roundedRect(MARGIN, y, WORK_W, 8, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, WHITE);
  doc.text("BOOKING RETURNED SUCCESSFULLY", PAGE_W / 2, y + 5.5, { align: "center" });
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  color(doc, GREEN);
  doc.text("Booking Summary", MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  color(doc, DARK_GREY);
  doc.text(`Customer: ${b.customerName}`, MARGIN, y);
  y += 4;
  doc.text(`Picked up: ${b.deliveryDate} ${b.deliveryTime}`, MARGIN, y);
  y += 4;
  doc.text(`Due return: ${b.returnDate} ${b.returnTime}`, MARGIN, y);
  y += 4;
  if (input.actualReturnDate) {
    doc.text(`Actually returned: ${input.actualReturnDate}${input.actualReturnTime ? ` ${input.actualReturnTime}` : ""}`, MARGIN, y);
    y += 4;
  }
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  color(doc, GREEN);
  doc.text("Returned Items", MARGIN, y);
  y += 5;
  for (const item of input.items) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color(doc, DARK_GREY);
    doc.text(`• ${item.dressName} (${item.category || "—"}) — ${rs(item.price)}`, MARGIN + 2, y);
    y += 4.5;
    if (y > PAGE_H - 70) break;
  }
  y += 4;

  draw(doc, GOLD);
  doc.setLineWidth(0.6);
  doc.roundedRect(PAGE_W / 2, y, WORK_W / 2 - 2, 42, 2, 2, "D");
  fill(doc, GREEN);
  doc.rect(PAGE_W / 2, y, WORK_W / 2 - 2, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, WHITE);
  doc.text("FINAL SETTLEMENT", PAGE_W / 2 + (WORK_W / 2 - 2) / 2, y + 5, { align: "center" });
  let sy = y + 11;
  const sx = PAGE_W / 2 + 4;
  const setRow = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(8);
    color(doc, DARK_GREY);
    doc.text(label, sx, sy);
    doc.text(val, PAGE_W - MARGIN, sy, { align: "right" });
    sy += 5;
  };
  setRow("Total Rental", rs(b.totalPrice));
  setRow("Advance Paid", rs(b.totalAdvance));
  setRow("Remaining Paid", rs(input.remainingCollected ?? b.totalRemaining));
  if ((input.lateFee ?? 0) > 0) setRow("Late Fee", rs(input.lateFee!));
  if ((input.damageCharge ?? 0) > 0) setRow("Damage Charge", rs(input.damageCharge!));
  setRow("Security Refunded", rs(input.securityRefunded ?? 0), true);

  const refunded = input.securityRefunded ?? 0;
  const owed = Math.max(0, b.totalRemaining - (input.remainingCollected ?? b.totalRemaining));
  fill(doc, owed > 0 ? RED : refunded > 0 ? SUCCESS : GREEN);
  doc.rect(PAGE_W / 2, y + 34, WORK_W / 2 - 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  color(doc, WHITE);
  const settleText =
    owed > 0
      ? `Amount Collected: ${rs(owed)}`
      : refunded > 0
        ? `Amount Refunded: ${rs(refunded)}`
        : "All Accounts Settled";
  doc.text(settleText, PAGE_W / 2 + (WORK_W / 2 - 2) / 2, y + 39.5, { align: "center" });

  if (input.qrDataUrl?.startsWith("data:image")) {
    try {
      doc.addImage(input.qrDataUrl, "PNG", PAGE_W / 2 - 12, PAGE_H - 52, 24, 24);
    } catch {
      /* skip */
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  color(doc, MID_GREY);
  doc.text("Booking reference QR — Team Fancy Collection", PAGE_W / 2, PAGE_H - 24, { align: "center" });
  doc.text(b.publicBookingId, PAGE_W / 2, PAGE_H - 20, { align: "center" });

  fill(doc, GREEN);
  doc.rect(0, PAGE_H - 14, PAGE_W, 14, "F");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  color(doc, WHITE);
  doc.text("Every occasion deserves elegance. — Team Fancy Collection", PAGE_W / 2, PAGE_H - 6, { align: "center" });
}

export async function generateReturnReceiptPdf(input: BookingBillPdfInput): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  drawReturnReceiptPage(doc, input);
  return Buffer.from(doc.output("arraybuffer"));
}

export async function uploadReturnReceiptPdf(
  pdfBuffer: Buffer,
  publicBookingId: string,
): Promise<string> {
  const filename = `ReturnReceipt_${publicBookingId}.pdf`;

  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`return-receipts/${filename}`, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  const { writeFile, mkdir } = await import("fs/promises");
  const dir = path.join(process.cwd(), "public", "uploads", "return-receipts");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, pdfBuffer);
  return `/uploads/return-receipts/${filename}`;
}

export async function uploadBookingBillPdf(
  pdfBuffer: Buffer,
  publicBookingId: string,
): Promise<string> {
  const filename = `${publicBookingId}.pdf`;

  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`booking-bills/${filename}`, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  const { writeFile, mkdir } = await import("fs/promises");
  const dir = path.join(process.cwd(), "public", "booking-bills");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), pdfBuffer);

  const base =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  return `${base}/booking-bills/${encodeURIComponent(filename)}`;
}
