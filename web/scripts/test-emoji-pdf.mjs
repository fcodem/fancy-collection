/**
 * Puppeteer smoke test: Twemoji SVGs embed correctly in a PDF (no app auth required).
 * Usage: node scripts/test-emoji-pdf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const emojiDir = path.join(root, "public", "emoji");
const outDir = path.join(root, "tmp");
const htmlPath = path.join(outDir, "emoji-pdf-test.html");
const pdfPath = path.join(outDir, "emoji-pdf-test.pdf");

const icons = ["1f4c5", "1f512", "2705", "1f4e6", "26a0"];
const imgs = icons
  .map(
    (icon) =>
      `<p style="font-size:18px;line-height:1.6"><img src="file:///${emojiDir.replace(/\\/g, "/")}/${icon}.svg" width="18" height="18" style="vertical-align:-0.1em" alt=""> Label for ${icon}</p>`,
  )
  .join("\n");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  htmlPath,
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:24px}</style></head><body><h1>Twemoji PDF test</h1>${imgs}</body></html>`,
  "utf8",
);

let puppeteer;
try {
  puppeteer = await import("puppeteer");
} catch {
  puppeteer = await import("puppeteer-core");
}

let browser;
const winChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (fs.existsSync(winChrome)) {
  browser = await puppeteer.default.launch({ headless: true, executablePath: winChrome, args: ["--no-sandbox"] });
} else {
  browser = await puppeteer.default.launch({ headless: true, args: ["--no-sandbox"] });
}
const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
await page.emulateMediaType("print");
const pdf = await page.pdf({ format: "A4", printBackground: true });
await browser.close();

fs.writeFileSync(pdfPath, pdf);
const size = fs.statSync(pdfPath).size;
console.log("Wrote", pdfPath, `(${size} bytes)`);
if (size < 8000) {
  console.error("PDF suspiciously small — emoji images may be missing");
  process.exit(1);
}
console.log("OK: emoji PDF smoke test passed");
