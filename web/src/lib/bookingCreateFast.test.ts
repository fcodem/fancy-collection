import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("booking create short atomic path", () => {
  it("uses one atomic PostgreSQL statement and no interactive transaction", () => {
    const fast = source("src/lib/services/bookingCreateFast.ts");
    assert.equal((fast.match(/prisma\.\$queryRaw/g) ?? []).length, 3);
    // One create statement, plus only the rare concurrent-winner lookup and
    // the idempotency pre-check helper. The create itself has no $transaction.
    const createPath = fast.slice(
      fast.indexOf("export async function createBookingFast"),
      fast.indexOf("export async function findBookingCreateOperation"),
    );
    assert.equal((createPath.match(/prisma\.\$queryRaw/g) ?? []).length, 2);
    assert.doesNotMatch(createPath, /\.\$transaction/);
    assert.match(fast, /Query budget: 3 parallel preload reads \+ 1 atomic write = 4 queries/);
  });

  it("performs set-based item, order, inventory and outbox writes", () => {
    const fast = source("src/lib/services/bookingCreateFast.ts");
    assert.match(fast, /jsonb_to_recordset\(\$\{itemRowsJson\}::jsonb\)/);
    assert.match(fast, /jsonb_to_recordset\(\$\{orderRowsJson\}::jsonb\)/);
    assert.match(fast, /UPDATE clothing_items[\s\S]*id = ANY\(\$\{itemIds\}::integer\[\]\)/);
    assert.match(fast, /INSERT INTO whatsapp_jobs/);
    assert.match(fast, /INSERT INTO mutation_receipts/);
    assert.match(fast, /\$\{requestHash\}, 'completed'/);
  });

  it("uses sorted advisory locks and one overlap query for all selected items", () => {
    const fast = source("src/lib/services/bookingCreateFast.ts");
    assert.match(fast, /unnest\(\$\{itemIds\}::integer\[\]\)/);
    assert.match(fast, /ORDER BY locked\.item_id/);
    assert.equal((fast.match(/conflict AS MATERIALIZED/g) ?? []).length, 1);
    assert.match(fast, /b\.status IN \('booked', 'delivered'\)/);
    // Strict boundaries preserve same-day return→delivery allowance.
    assert.match(fast, /b\.delivery_date::date < \$\{returnDate\}/);
    assert.match(fast, /b\.return_date::date > \$\{deliveryDate\}/);
    assert.match(fast, /existing_item\.is_cancelled = false/);
    assert.match(fast, /existing_item\.is_returned = false/);
  });

  it("inserts QR and public tokens with the booking instead of read-then-update", () => {
    const fast = source("src/lib/services/bookingCreateFast.ts");
    assert.match(fast, /const qrToken = randomUUID\(\)/);
    assert.match(fast, /client_request_id, qr_token, public_booking_id, public_access_token/);
    assert.doesNotMatch(fast, /booking\.update/);
  });

  it("does not statically import PDF, WhatsApp worker, Chromium, Blob, or AI modules", () => {
    const orchestration = source("src/lib/services/bookingCreateOrchestration.ts");
    const fast = source("src/lib/services/bookingCreateFast.ts");
    assert.doesNotMatch(
      `${orchestration}\n${fast}`,
      /^import .*?(jobQueue|puppeteer|chromium|slipHtml|aiJob|@vercel\/blob)/m,
    );
    assert.match(orchestration, /await import\([\s\S]*whatsapp\/jobQueue/);
  });

  it("reports the required safe timing stages and query count", () => {
    const route = source("src/app/api/booking/route.ts");
    for (const stage of [
      "authMs",
      "preloadMs",
      "conflictMs",
      "transactionMs",
      "postCommitMs",
    ]) {
      assert.match(route, new RegExp(stage));
    }
    assert.match(route, /addQueries\(createTimings\.queryCount\)/);
  });
});
