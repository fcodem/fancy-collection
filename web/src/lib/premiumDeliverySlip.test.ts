import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("premium delivery slip reliability", () => {
  it("does not jsPDF-fallback delivery slips on render failure", () => {
    const automated = read("src/lib/services/whatsapp/automatedMessages.ts");
    const fn = automated.slice(
      automated.indexOf("export async function sendDeliverySlipWhatsApp"),
      automated.indexOf("export async function sendPartialReturnSlipWhatsApp"),
    );
    assert.doesNotMatch(fn, /generateOperationSlipPdfFallback\(\s*["']delivery["']/);
    assert.match(fn, /failPremiumSlipRender/);
  });

  it("retries ETXTBSY/EBUSY in the browser pool with cleanup", () => {
    const pool = read("src/lib/services/whatsapp/pdfBrowserPool.ts");
    assert.match(pool, /MAX_RENDER_ATTEMPTS = 3/);
    assert.match(pool, /MAX_LAUNCH_ATTEMPTS = 3/);
    assert.match(pool, /LAUNCH_RETRY_DELAYS_MS = \[500, 1000\]/);
    assert.match(pool, /validatePremiumSlipDom/);
    assert.match(pool, /isEnospcError/);
    assert.match(pool, /purgeIncompleteLegacyChromiumCache/);
    assert.match(pool, /chromium\.executablePath/);
    assert.match(pool, /enqueueSlipRender/);
    assert.match(pool, /ensureTmpFreeSpace/);
    assert.match(pool, /finally/);
    assert.match(pool, /disposeRenderSession/);
  });
});
