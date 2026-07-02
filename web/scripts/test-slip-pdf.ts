import fs from "fs";
import { generateReturnSlipPdf } from "../src/lib/services/whatsapp/slipHtmlPdf.server";

async function main() {
  const bookingId = parseInt(process.argv[2] || "26", 10);
  const buf = await generateReturnSlipPdf(bookingId, undefined, { scope: "full" });
  fs.mkdirSync("tmp", { recursive: true });
  const out = `tmp/return-slip-${bookingId}.pdf`;
  fs.writeFileSync(out, buf);
  console.log(`Saved ${buf.length} bytes to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
