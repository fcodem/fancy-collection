import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("Chromium isolation", () => {
  const srcFiles = walk(path.join(root, "src"));
  // Match real import/require/dynamic-import forms only, not comment mentions.
  const PKG = String.raw`(?:@sparticuz\/chromium|puppeteer-core|puppeteer)`;
  const CHROMIUM = new RegExp(
    String.raw`(?:from\s*["']${PKG}["'])|(?:import\(\s*["']${PKG}["']\s*\))|(?:require\(\s*["']${PKG}["']\s*\))`,
  );

  it("imports Chromium/Puppeteer in exactly one module", () => {
    const importers = srcFiles.filter((f) => {
      if (/\.test\.tsx?$/.test(f)) return false;
      return CHROMIUM.test(fs.readFileSync(f, "utf8"));
    });
    const rel = importers.map((f) => path.relative(root, f).replace(/\\/g, "/"));
    assert.deepEqual(
      rel,
      ["src/lib/services/whatsapp/pdfBrowserPool.ts"],
      `Unexpected Chromium importers: ${rel.join(", ")}`,
    );
  });

  it("traces Chromium into only the internal render function", () => {
    const config = read("next.config.ts");
    assert.match(config, /"\/api\/internal\/slip\/render":\s*\[CHROMIUM_TRACE\]/);
    const includes = config.slice(
      config.indexOf("outputFileTracingIncludes"),
      config.indexOf("outputFileTracingExcludes"),
    );
    assert.equal((includes.match(/CHROMIUM_TRACE/g) ?? []).length, 1);
    assert.doesNotMatch(includes, /@prisma\/client|\.prisma\/client/);
    assert.match(config, /outputFileTracingExcludes/);
    assert.match(config, /public\/uploads\/\*\*\/\*/);
  });

  it("only the internal route imports the direct renderer", () => {
    const importers = srcFiles.filter((f) =>
      /slipHtmlPdfDirect\.server/.test(fs.readFileSync(f, "utf8")) && !/slipHtmlPdfDirect\.server\.ts$/.test(f),
    );
    const rel = importers.map((f) => path.relative(root, f).replace(/\\/g, "/"));
    assert.deepEqual(rel, ["src/app/api/internal/slip/render/route.ts"]);
  });

  it("does not install the full Puppeteer browser package", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.dependencies?.puppeteer, undefined);
    assert.ok(pkg.dependencies?.["puppeteer-core"]);
  });
});

describe("native AI bundle isolation", () => {
  it("keeps shared instrumentation free of worker/model imports", () => {
    const instrumentation = read("src/instrumentation.ts");
    assert.doesNotMatch(
      instrumentation,
      /dressChecker|queueSelfHeal|ensureEnhancementSchema|@xenova|onnxruntime/,
    );
  });

  it("uses a lightweight health module without the worker graph", () => {
    const route = read("src/app/api/health/route.ts");
    const health = read("src/lib/dressChecker/publicHealthStatus.ts");
    assert.match(route, /dressChecker\/publicHealthStatus/);
    assert.doesNotMatch(
      health,
      /(?:from\s*["'][^"']*(?:aiJobWorker|processInventory|@xenova|onnxruntime)|import\(\s*["'][^"']*(?:aiJobWorker|processInventory|@xenova|onnxruntime))/,
    );
  });

  it("keeps photo-removal cleanup out of the recognition worker graph", () => {
    const route = read("src/app/api/inventory/[id]/route.ts");
    const cleanup = read("src/lib/dressChecker/photoRemovedCleanup.ts");
    assert.match(route, /dressChecker\/photoRemovedCleanup/);
    assert.doesNotMatch(route, /dressCheckerIndexing/);
    assert.doesNotMatch(
      cleanup,
      /(?:from\s*["'][^"']*(?:processInventory|generateProfile|@xenova|onnxruntime)|import\(\s*["'][^"']*(?:processInventory|generateProfile|@xenova|onnxruntime))/,
    );
  });
});

describe("mutations queue slips without waiting for Chromium", () => {
  it("booking create schedules the durable bill and defers processing", () => {
    const route = read("src/app/api/booking/route.ts");
    const orchestration = read("src/lib/services/bookingCreateOrchestration.ts");
    const fast = read("src/lib/services/bookingCreateFast.ts");
    assert.match(route, /nextAfter: after/);
    assert.match(fast, /inserted_outbox|booking_bill/);
    assert.match(orchestration, /processWhatsAppJobQueue/);
    assert.doesNotMatch(`${route}\n${orchestration}\n${fast}`, /slipHtmlPdfDirect|pdfBrowserPool/);
  });

  it("delivery and return save queue in-transaction and drain only in after()", () => {
    for (const file of [
      "src/app/api/booking-delivery/[id]/save/route.ts",
      "src/app/api/return/[id]/save/route.ts",
    ]) {
      const source = read(file);
      assert.match(source, /schedule(?:Delivery|Return|Incomplete)SlipInTx/);
      assert.match(source, /after\(async \(\) =>/);
      assert.doesNotMatch(source, /slipHtmlPdfDirect|pdfBrowserPool/);
    }
  });
});

describe("internal renderer authentication", () => {
  it("verifies an HMAC (timestamp + nonce + body hash), not a plain secret", () => {
    const route = read("src/app/api/internal/slip/render/route.ts");
    assert.match(route, /verifySlipRenderAuth/);
    assert.match(route, /await req\.text\(\)/);
    assert.doesNotMatch(route, /isValidPdfRenderSecret/);
  });

  it("signs outgoing render requests", () => {
    const caller = read("src/lib/services/whatsapp/slipHtmlPdf.server.ts");
    assert.match(caller, /buildSlipRenderAuthHeaders/);
    assert.doesNotMatch(caller, /"x-pdf-secret"/);
  });

  it("uses a timing-safe comparison and replay guard", () => {
    const auth = read("src/lib/slipRenderAuth.ts");
    assert.match(auth, /timingSafeEqual/);
    assert.match(auth, /seenNonces/);
    assert.match(auth, /reason: "replay"/);
    assert.match(auth, /reason: "expired"/);
  });
});

describe("branded jsPDF fallback", () => {
  it("embeds the logo in operation slip fallback", () => {
    const fallback = read("src/lib/services/whatsapp/operationSlipPdfFallback.ts");
    assert.match(fallback, /loadSlipLogoDataUrl/);
    assert.match(fallback, /addImage/);
  });
});
