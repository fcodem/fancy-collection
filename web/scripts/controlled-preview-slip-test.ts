/**
 * Controlled end-to-end slip + scan verification for Preview/staging.
 *
 * Usage (from web/):
 *   npm run test:controlled-preview-slip
 *
 * Requires .env.local with DATABASE_URL, Meta WhatsApp credentials, and optional:
 *   WHATSAPP_TEST_PHONE — approved test recipient (default 8077843874)
 *   NEXT_PUBLIC_APP_URL — preview base URL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../src/lib/prisma";
import { createBooking } from "../src/lib/services/bookingCrud";
import { saveDelivery, saveReturn } from "../src/lib/services/operations";
import {
  scheduleBookingBill,
  processWhatsAppJobQueue,
} from "../src/lib/services/whatsapp/jobQueue";
import { getWhatsAppRenderFailureReport } from "../src/lib/services/whatsapp/whatsappJobClassification";
import { finalizeSlipTrigger } from "../src/lib/services/whatsapp/slipDebounce";
import { resolveInventoryFromScannedCode } from "../src/lib/services/inventoryScanCode";
import { createScannedDressAvailabilityService } from "../src/lib/services/scannedDressAvailability";
import { isWhatsAppReceiptsDisabled } from "../src/lib/services/whatsapp/metaApi";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const PHONE = process.env.WHATSAPP_TEST_PHONE || "8077843874";
const DELIVERY_DATE = "2026-09-15";
const RETURN_DATE = "2026-09-17";
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const BY = "controlled-preview-slip-test";

type StepResult = { step: string; ok: boolean; detail: string };

const results: StepResult[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${step}: ${detail}`);
}

async function findLrgDress() {
  const item = await prisma.clothingItem.findFirst({
    where: { sku: { equals: "LRG-001", mode: "insensitive" } },
    select: { id: true, name: true, sku: true, size: true, category: true },
  });
  if (!item) {
    throw new Error("Inventory item LRG-001 not found — run backfill:inventory-scan-codes first.");
  }
  return item;
}

async function waitForJob(bookingId: number, jobType: string, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await prisma.whatsAppJob.findFirst({
      where: { bookingId, jobType },
      orderBy: { createdAt: "desc" },
    });
    if (job && (job.status === "done" || job.status === "failed")) return job;
    await processWhatsAppJobQueue(3, { bookingId });
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Timed out waiting for ${jobType} job on booking ${bookingId}`);
}

async function main() {
  if (isWhatsAppReceiptsDisabled()) {
    record("preflight", false, "WhatsApp receipts disabled — enable for live Preview test.");
    process.exitCode = 2;
  } else {
    record("preflight", true, `Using test phone ${PHONE}`);

    const dress = await findLrgDress();
    record("fixture LRG-001", true, `${dress.name} (${dress.sku}, size ${dress.size ?? "—"})`);

    const booking = await createBooking(
      {
        customer_name: "CONTROLLED PREVIEW TEST",
        customer_address: "Preview test address",
        contact_1: PHONE,
        whatsapp_no: PHONE,
        payment_mode: "cash",
        delivery_date: DELIVERY_DATE,
        delivery_time: "12:00 Noon",
        return_date: RETURN_DATE,
        return_time: "11:00 AM",
        items: [{ item_id: dress.id, dress_name: dress.name, category: dress.category, price: 5000 }],
        notes: "Controlled preview slip test — safe to delete",
      },
      BY,
    );
    record("synthetic booking", true, `#${booking.id}`);

    const bookingItem = await prisma.bookingItem.findFirst({
      where: { bookingId: booking.id, itemId: dress.id },
      select: { id: true },
    });
    if (!bookingItem) throw new Error("Booking item row missing");

    await scheduleBookingBill(booking.id, ORIGIN, BY, { forceResend: true });
    await finalizeSlipTrigger(booking.id, "booking", { requestOrigin: ORIGIN, createdBy: BY });
    const billJob = await waitForJob(booking.id, "booking_bill");
    const billPayload = (billJob.payload ?? {}) as Record<string, unknown>;
    record(
      "premium booking slip WhatsApp",
      billJob.status === "done" && Boolean(billPayload.metaMessageId),
      `status=${billJob.status} meta=${String(billPayload.metaMessageId ?? "none")}`,
    );

    await saveDelivery(
      booking.id,
      {
        payment_mode: "cash",
        security_payment_mode: "cash",
        items: [
          {
            booking_item_id: bookingItem.id,
            remaining_collected: 500,
            security_collected: 250,
            delivery_notes: "Controlled preview delivery",
            mark_delivered: true,
          },
        ],
      },
      BY,
    );
    await finalizeSlipTrigger(booking.id, "delivery", { requestOrigin: ORIGIN, createdBy: BY });
    const deliveryJob = await waitForJob(booking.id, "delivery_slip");
    const deliveryPayload = (deliveryJob.payload ?? {}) as Record<string, unknown>;
    record(
      "premium delivery slip WhatsApp",
      deliveryJob.status === "done" && Boolean(deliveryPayload.metaMessageId),
      `status=${deliveryJob.status} meta=${String(deliveryPayload.metaMessageId ?? "none")}`,
    );

    const qrResolved = await resolveInventoryFromScannedCode("LRG-001");
    record(
      "scan QR LRG-001",
      qrResolved.status === "FOUND",
      `${qrResolved.status}${qrResolved.inventory ? ` → ${qrResolved.inventory.name}` : ""}`,
    );

    const availability = createScannedDressAvailabilityService(prisma);
    const avail = await availability.checkScannedDressAvailability({
      rawCode: "LRG-001",
      deliveryDateTime: `${DELIVERY_DATE}T12:00:00+05:30`,
      returnDateTime: `${RETURN_DATE}T11:00:00+05:30`,
      excludeBookingId: booking.id,
    });
    record(
      "availability check (no 404)",
      avail.status !== "CODE_NOT_FOUND",
      avail.status,
    );

    const code128 = await prisma.inventoryScanCode.findFirst({
      where: { inventoryId: dress.id, format: "CODE_128", active: true },
      select: { code: true },
    });
    if (code128) {
      const barcodeResolved = await resolveInventoryFromScannedCode(code128.code);
      record(
        "scan Code 128",
        barcodeResolved.status === "FOUND" && barcodeResolved.inventory?.id === dress.id,
        `${code128.code} → ${barcodeResolved.status}`,
      );
    } else {
      record("scan Code 128", false, "No active CODE_128 mapping for LRG-001 dress");
    }

    await saveReturn(booking.id, "mark_item_returned", { booking_item_id: bookingItem.id }, BY);
    await saveReturn(
      booking.id,
      "incomplete_return",
      {
        items: [
          {
            booking_item_id: bookingItem.id,
            is_incomplete: true,
            incomplete_notes: "Controlled preview partial return",
            security_held: 200,
          },
        ],
        incomplete_notes: "Controlled preview incomplete slip",
      },
      BY,
    );
    await finalizeSlipTrigger(booking.id, "return", { requestOrigin: ORIGIN, createdBy: BY });
    const incompleteJob = await waitForJob(booking.id, "incomplete_slip");
    const incompletePayload = (incompleteJob.payload ?? {}) as Record<string, unknown>;
    record(
      "partial return incomplete slip",
      incompleteJob.status === "done" && Boolean(incompletePayload.metaMessageId),
      `status=${incompleteJob.status} meta=${String(incompletePayload.metaMessageId ?? "none")}`,
    );

    const failureReport = await getWhatsAppRenderFailureReport(100);
    const newFailures = failureReport.jobs.filter((row) => row.bookingId === booking.id);
    record(
      "no render failures for this booking",
      newFailures.length === 0,
      newFailures.length ? newFailures.map((r) => r.failedReason).join("; ") : "clean",
    );

    console.log("\n--- Controlled preview test complete ---");
    console.log(`Booking #${booking.id} — verify PDFs on WhatsApp test phone ${PHONE}`);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.log(`${failed.length} step(s) failed.`);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    record("fatal", false, error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
