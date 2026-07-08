/**
 * Generate booking slip PDF without importing server-only Next modules.
 * Usage: node scripts/generate-booking-slip-pdf.mjs [bookingId]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bookingId = parseInt(process.argv[2] || "15352", 10);

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const secret =
  process.env.PDF_RENDER_SECRET?.trim() ||
  process.env.CRON_SECRET?.trim() ||
  process.env.SESSION_SECRET?.trim() ||
  "";

if (!secret) {
  console.error("Set PDF_RENDER_SECRET, CRON_SECRET, or SESSION_SECRET in .env.local");
  process.exit(1);
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    : "",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const executablePath = chromeCandidates.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error("Chrome/Edge not found for PDF generation");
  process.exit(1);
}

const params = new URLSearchParams({ pdfSecret: secret });
const url = `http://127.0.0.1:3000/booking/${bookingId}/slip?${params.toString()}`;
const rootSelector =
  "#booking-slip-root, #delivery-slip-root, #return-slip-root, #incomplete-slip-root, .slip-page-wrap";

console.log("Loading", url);

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(90_000);
  await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

  const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });
  if (!response?.ok()) {
    throw new Error(`Slip page failed (HTTP ${response?.status() ?? "unknown"})`);
  }

  await page.waitForSelector("#booking-slip-root", { timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 3000));

  const textLen = await page.evaluate(() => document.body?.innerText?.length ?? 0);
  console.log("page text length (screen):", textLen);

  await page.emulateMediaType("print");
  await new Promise((r) => setTimeout(r, 500));
  const printLen = await page.evaluate(() => document.body?.innerText?.length ?? 0);
  console.log("page text length (print):", printLen);
  await page.evaluate(async () => {
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    );
  });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    timeout: 60_000,
  });

  const outDir = path.join(__dirname, "..", "public", "uploads", "booking-bills");
  fs.mkdirSync(outDir, { recursive: true });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { publicBookingId: true, customerName: true },
  });
  const publicId = booking?.publicBookingId || `BK-${String(bookingId).padStart(6, "0")}`;
  const filename = `${publicId}.pdf`;
  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, pdf);

  const pdfUrl = `http://localhost:3000/uploads/booking-bills/${encodeURIComponent(filename)}`;
  await prisma.booking.update({
    where: { id: bookingId },
    data: { qrCodeUrl: pdfUrl, publicBookingId: publicId },
  });
  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      {
        bookingId,
        customerName: booking?.customerName,
        publicBookingId: publicId,
        pdfUrl,
        localPath: outPath,
        bytes: pdf.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
