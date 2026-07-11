/**
 * Submit all slip + marketing WhatsApp templates to Meta.
 * Usage (from web/): npx tsx scripts/submit-all-slip-templates.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  const { ensureBookingBillTemplate } = await import(
    "../src/lib/services/whatsapp/bookingBillTemplate"
  );
  const { ensureAllSlipTemplates } = await import(
    "../src/lib/services/whatsapp/slipTemplates"
  );

  const booking = await ensureBookingBillTemplate();
  console.log("booking_confirmation", JSON.stringify(booking, null, 2));
  const slips = await ensureAllSlipTemplates({ includeMarketing: true });
  console.log("slips", JSON.stringify(slips, null, 2));
  if (!booking.ok || !slips.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
