import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("premium delivery slip reliability", () => {
  it("does not jsPDF-fallback delivery slips on render failure", () => {
    const source = read("src/lib/services/whatsapp/automatedMessages.ts");
    const fn = source.slice(
      source.indexOf("export async function sendDeliverySlipWhatsApp"),
      source.indexOf("export async function sendPartialReturnSlipWhatsApp"),
    );
    assert.doesNotMatch(fn, /generateOperationSlipPdfFallback\(\s*["']delivery["']/);
    assert.match(fn, /failPremiumSlipRender/);
    assert.match(source, /retryable:\s*true/);
  });

  it("retries ENOSPC once in the browser pool with cleanup", () => {
    const pool = read("src/lib/services/whatsapp/pdfBrowserPool.ts");
    assert.match(pool, /MAX_RENDER_ATTEMPTS = 2/);
    assert.match(pool, /isEnospcError/);
    assert.match(pool, /cleanSlipTempDirs/);
    assert.match(pool, /finally/);
    assert.match(pool, /disposeRenderBrowser/);
    assert.match(pool, /puppeteer_dev_chrome_profile-/);
  });

  it("caches Chromium extraction behind a promise lock", () => {
    const pool = read("src/lib/services/whatsapp/pdfBrowserPool.ts");
    assert.match(pool, /chromiumExecutablePromise/);
    assert.match(pool, /resolveChromiumExecutable/);
    assert.match(pool, /ensureSlipTempHeadroom/);
  });

  it("logs safe diagnostics from the render route", () => {
    const route = read("src/app/api/internal/slip/render/route.ts");
    assert.match(route, /logSlipRenderDiagnostic/);
    assert.match(route, /measureSlipTempUsage/);
    assert.match(route, /cleanSlipTempDirs/);
    assert.match(route, /PREMIUM_SLIP_RENDER_FAILED/);
    assert.doesNotMatch(route, /customerName/);
  });
});

describe("premium delivery slip template parity", () => {
  it("buildDeliverySlipData includes catalog photo and sku", () => {
    const data = read("src/lib/slipBookingData.ts");
    assert.match(data, /inventoryPhotoRef/);
    assert.match(data, /photoUrl/);
    assert.match(data, /sku/);
  });

  it("DeliverySlip renders premium markers not minimal fallback fields", () => {
    const slip = read("src/components/DeliverySlip.tsx");
    assert.match(slip, /DELIVERY SLIP/);
    assert.match(slip, /DELIVERED/);
    assert.match(slip, /Please Return All Items By/);
    assert.match(slip, /Delivery Payment Summary/);
    assert.match(slip, /qrDataUrl/);
    assert.match(slip, /SlipLogo/);
    assert.match(slip, /photoUrl/);
    assert.match(slip, /slip-outfit-page/);
    assert.match(slip, /PremiumSlipMarker/);
    assert.doesNotMatch(slip, /jsPDF/);
  });

  it("minimal jsPDF fallback only exposes booking/customer/phone lines", () => {
    const fallback = read("src/lib/services/whatsapp/operationSlipPdfFallback.ts");
    assert.match(fallback, /Customer:/);
    assert.match(fallback, /Phone:/);
    assert.doesNotMatch(fallback, /Delivery Payment Summary/);
    assert.doesNotMatch(fallback, /Please Return All Items By/);
  });

  it("WhatsApp and browser share the same HTML renderer endpoint", () => {
    const htmlPdf = read("src/lib/services/whatsapp/slipHtmlPdf.server.ts");
    const direct = read("src/lib/services/whatsapp/slipHtmlPdfDirect.server.ts");
    assert.match(htmlPdf, /renderSlipViaEndpoint/);
    assert.match(htmlPdf, /\/api\/internal\/slip\/render/);
    assert.match(direct, /buildSlipPageUrl/);
    assert.match(direct, /delivery-slip-root/);
  });
});
