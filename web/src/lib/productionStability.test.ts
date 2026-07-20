import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

describe("QR label printing", () => {
  it("QR is constrained to 18mm inside sticker boundary", () => {
    const source = read("src/components/PrintCodesClient.tsx");
    assert.match(source, /18mm/);
    assert.match(source, /max-width:\s*18mm/);
    assert.doesNotMatch(source, /width:\s*30mm/);
    assert.doesNotMatch(source, /width:\s*32mm/);
  });

  it("label cell uses safe 2.5mm padding", () => {
    const source = read("src/components/PrintCodesClient.tsx");
    assert.match(source, /padding:\s*2\.5mm/);
  });

  it("dress name is prominent at 11pt or larger", () => {
    const source = read("src/components/PrintCodesClient.tsx");
    assert.match(source, /label-name/);
    assert.match(source, /font-size:\s*11pt/);
    assert.match(source, /font-weight:\s*900/);
  });

  it("size uses badge styling", () => {
    const source = read("src/components/PrintCodesClient.tsx");
    assert.match(source, /label-size-badge/);
    assert.match(source, /SIZE/);
  });

  it("branding uses two-line split", () => {
    const source = read("src/components/PrintCodesClient.tsx");
    assert.match(source, /BRAND_NAME/);
    assert.match(source, /BRAND_OWNER/);
  });

  it("QR-only layout uses grid not absolute positioning", () => {
    const source = read("src/components/PrintCodesClient.tsx");
    assert.match(source, /display:\s*grid/);
    assert.doesNotMatch(source, /position:\s*absolute/);
  });

  it("human-readable code stays within 20mm", () => {
    const source = read("src/components/PrintCodesClient.tsx");
    assert.match(source, /max-width:\s*20mm/);
    assert.match(source, /text-overflow:\s*ellipsis/);
  });
});

describe("WhatsApp slip rendering", () => {
  it("slip health endpoint exists", () => {
    assert.ok(exists("src/app/api/internal/slip/health/route.ts"));
    const source = read("src/app/api/internal/slip/health/route.ts");
    assert.match(source, /freeTmpBytes/);
    assert.match(source, /sparticuzExtractPresent/);
    assert.match(source, /activeRenders/);
  });

  it("slip renderer does not import Sharp or ONNX", () => {
    const renderer = read("src/lib/services/whatsapp/slipHtmlPdfDirect.server.ts");
    assert.doesNotMatch(renderer, /import.*sharp/i);
    assert.doesNotMatch(renderer, /import.*onnx/i);
    assert.doesNotMatch(renderer, /import.*transformers/i);
  });

  it("render route returns retryable 503 on ENOSPC", () => {
    const route = read("src/app/api/internal/slip/render/route.ts");
    assert.match(route, /503/);
    assert.match(route, /retryable/);
  });
});

describe("AI worker safety", () => {
  it("AI worker uses dynamic imports for heavy modules", () => {
    const worker = read("src/lib/dressChecker/aiJobWorker.ts");
    assert.match(worker, /await import\("\.\/processInventory"\)/);
    assert.doesNotMatch(worker, /^import.*processInventory/m);
  });

  it("AI feature flags exist for native processing", () => {
    const worker = read("src/lib/dressChecker/aiJobWorker.ts");
    assert.match(worker, /AI_LOCAL_COLOUR_ANALYSIS_ENABLED/);
    assert.match(worker, /AI_NATIVE_EMBEDDING_ENABLED/);
    assert.match(worker, /AI_OPENAI_ENRICHMENT_ENABLED/);
    assert.match(worker, /AI_FLAGS/);
  });

  it("deterministic failures are detected and dead-lettered", () => {
    const worker = read("src/lib/dressChecker/aiJobWorker.ts");
    assert.match(worker, /isDeterministicFailure/);
    assert.match(worker, /failOrRetryAiJob/);
  });
});

describe("OpenAI key verification", () => {
  it("end-to-end test function exists with structured result", () => {
    const verify = read("src/lib/ai/verifyOpenAiKey.ts");
    assert.match(verify, /verifyOpenAiEndToEnd/);
    assert.match(verify, /authenticationPassed/);
    assert.match(verify, /responsesPassed/);
    assert.match(verify, /embeddingsPassed/);
    assert.match(verify, /errorCategory/);
    assert.doesNotMatch(verify, /console\.log.*apiKey/);
    assert.doesNotMatch(verify, /console\.log.*key/i);
  });

  it("test endpoint supports full verification", () => {
    const route = read("src/app/api/admin/ai/settings/test/route.ts");
    assert.match(route, /verifyOpenAiEndToEnd/);
    assert.match(route, /requireOwner/);
  });
});

describe("dashboard resilience", () => {
  it("dashboard uses Suspense boundaries for sections", () => {
    const page = read("src/app/page.tsx");
    assert.match(page, /Suspense/);
    assert.match(page, /DashboardSectionBoundary|ErrorBoundary/);
  });
});

describe("booking record page", () => {
  it("warning items do not block core booking render", () => {
    const page = read("src/app/booking/[id]/page.tsx");
    assert.doesNotMatch(page, /const warningItems = await loadWarningItemsForBooking/);
    assert.match(page, /Suspense/);
  });

  it("booking record has loading and error components", () => {
    assert.ok(exists("src/app/booking/[id]/loading.tsx"));
    assert.ok(exists("src/app/booking/[id]/error.tsx"));
  });
});

describe("scanner behavior", () => {
  it("scanner closes camera after first scan", () => {
    const scanner = read("src/components/DressAvailabilityScanner.tsx");
    assert.match(scanner, /session\.stop|stopCamera|stop\(\)/);
    assert.match(scanner, /Scan Next Dress|scanNextDress/i);
  });
});

describe("performance fixes deployed", () => {
  it("booked items uses pagination and lean select", () => {
    const service = read("src/lib/services/bookingList.ts");
    assert.match(service, /bookingListSelect/);
    assert.match(service, /take/);
    assert.match(service, /page/);
    assert.doesNotMatch(service, /findIndex/);
  });

  it("late returns uses pagination", () => {
    const service = read("src/lib/services/lateReturnData.ts");
    assert.match(service, /lateReturnSelect/);
    assert.match(service, /page/);
    assert.match(service, /take/);
  });

  it("staff attendance uses lazy tab loading", () => {
    const client = read("src/components/StaffAttendanceClient.tsx");
    assert.match(client, /attendance-dashboard/);
    assert.match(client, /salary-dashboard/);
    assert.match(client, /rightTab/);
  });

  it("staff attendance page does not load allUsers initially", () => {
    const page = read("src/app/staff-attendance/page.tsx");
    assert.doesNotMatch(page, /allUsers/);
    assert.doesNotMatch(page, /listUsers/);
    assert.match(page, /getStaffAttendanceToday/);
  });

  it("booking list and late return have error boundaries", () => {
    assert.ok(exists("src/app/booking-list/error.tsx"));
    assert.ok(exists("src/app/late-return/error.tsx"));
  });

  it("shared read limiter exists", () => {
    const limit = read("src/lib/readDbLimit.ts");
    assert.match(limit, /AsyncSemaphore/);
  });
});

describe("database backup", () => {
  it("backup prefers dedicated BACKUP_BLOB_READ_WRITE_TOKEN", () => {
    const route = read("src/app/api/cron/db-backup/route.ts");
    assert.match(route, /BACKUP_BLOB_READ_WRITE_TOKEN/);
    assert.match(route, /access:\s*"private"/);
  });
});
