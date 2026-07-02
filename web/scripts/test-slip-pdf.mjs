/**
 * Quick smoke test: generate return slip PDF and save to tmp/
 * Usage: node scripts/test-slip-pdf.mjs [bookingId] [kind]
 * kind: booking | delivery | return | incomplete
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bookingId = parseInt(process.argv[2] || "26", 10);
const kind = process.argv[3] || "return";

// Load env from .env.local
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const { generateReturnSlipPdf, generateBookingSlipPdf, generateDeliverySlipPdf, generateIncompleteSlipPdf } =
  await import("../src/lib/services/whatsapp/slipHtmlPdf.server.ts");

const generators = {
  booking: () => generateBookingSlipPdf(bookingId),
  delivery: () => generateDeliverySlipPdf(bookingId, undefined, { scope: "full" }),
  return: () => generateReturnSlipPdf(bookingId, undefined, { scope: "full" }),
  incomplete: () => generateIncompleteSlipPdf(bookingId),
};

const gen = generators[kind];
if (!gen) {
  console.error("Unknown kind:", kind);
  process.exit(1);
}

console.log(`Generating ${kind} slip PDF for booking ${bookingId}...`);
const buf = await gen();
const outDir = path.join(__dirname, "..", "tmp");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${kind}-slip-${bookingId}.pdf`);
fs.writeFileSync(outPath, buf);
console.log(`Saved ${buf.length} bytes to ${outPath}`);
