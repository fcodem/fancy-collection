import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyPremiumRenderFailure,
  isPremiumRenderFailureRetryable,
  PremiumSlipRenderError,
  PREMIUM_SLIP_RENDER_FAILED,
} from "./services/whatsapp/slipRenderErrors";
import {
  isBrowserLaunchFailure,
  isChromiumSharedLibraryError,
  isCompleteChromiumExtract,
  isNonRetryablePremiumRenderError,
  isRetryableSlipRenderError,
  purgeIncompleteLegacyChromiumCache,
} from "./slipTempCleanup";
import {
  isPremiumSlipRenderFailureMessage,
  isWhatsAppRenderFailureReason,
} from "./services/whatsapp/whatsappProviderOutcome";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("Chromium shared-library / launch failure classification", () => {
  it("detects libnss3 missing-library errors as non-retryable", () => {
    const err = new Error(
      "Failed to launch browser process. error while loading shared libraries: libnss3.so",
    );
    assert.equal(isChromiumSharedLibraryError(err), true);
    assert.equal(isBrowserLaunchFailure(err), true);
    assert.equal(isNonRetryablePremiumRenderError(err), true);
    assert.equal(isRetryableSlipRenderError(err), false);
    assert.equal(classifyPremiumRenderFailure(err), "SHARED_LIBRARY");
    assert.equal(isPremiumRenderFailureRetryable(err), false);
  });

  it("classifies transient page timeouts as retryable", () => {
    const err = new Error("Navigation timeout of 90000 ms exceeded");
    assert.equal(isNonRetryablePremiumRenderError(err), false);
    assert.equal(isRetryableSlipRenderError(err), true);
    assert.equal(classifyPremiumRenderFailure(err), "TRANSIENT");
    assert.equal(isPremiumRenderFailureRetryable(err), true);
  });

  it("marks PremiumSlipRenderError browser launch as non-retryable", () => {
    const err = new PremiumSlipRenderError("Failed to launch browser", "BROWSER_LAUNCH_FAILED", false);
    assert.equal(err.retryable, false);
    assert.equal(isPremiumRenderFailureRetryable(err), false);
  });
});

describe("legacy fc-chromium cache purge", () => {
  it("removes incomplete fc-chromium extract (binary only, no al2023)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-purge-test-"));
    const broken = path.join(tmpDir, "fc-chromium-v149");
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, "chromium"), Buffer.from("fake"));
    assert.equal(isCompleteChromiumExtract(broken), false);
    const removed = purgeIncompleteLegacyChromiumCache(tmpDir);
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(broken), false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("pdfBrowserPool serverless Chromium contract", () => {
  it("uses @sparticuz/chromium executablePath directly without fc-chromium copy", () => {
    const pool = read("src/lib/services/whatsapp/pdfBrowserPool.ts");
    assert.doesNotMatch(pool, /adoptSparticuzExtract/);
    assert.doesNotMatch(pool, /moveOrCopyPath/);
    assert.match(pool, /await chromium\.executablePath/);
    assert.match(pool, /chromium\.args/);
    assert.match(pool, /headless: true/);
    assert.match(pool, /MAX_LAUNCH_ATTEMPTS = 1/);
    assert.match(pool, /purgeIncompleteLegacyChromiumCache/);
  });
});

describe("jsPDF fallback + WhatsApp send pipeline", () => {
  it("automatedMessages uses renderSlipWithFallback for booking bills", () => {
    const src = read("src/lib/services/whatsapp/automatedMessages.ts");
    const fn = src.slice(
      src.indexOf("export async function sendBookingBillWhatsApp"),
      src.indexOf("export async function sendPostponementNoticeWhatsApp"),
    );
    assert.match(fn, /renderSlipWithFallback/);
    assert.match(fn, /generateBookingBillPdfFallback/);
    assert.doesNotMatch(fn, /failPremiumSlipRender/);
  });

  it("delivery slip falls back to jsPDF and still returns renderer metadata", () => {
    const src = read("src/lib/services/whatsapp/automatedMessages.ts");
    const fn = src.slice(
      src.indexOf("export async function sendDeliverySlipWhatsApp"),
      src.indexOf("export async function sendPartialReturnSlipWhatsApp"),
    );
    assert.match(fn, /generateOperationSlipPdfFallback\(\s*["']delivery["']/);
    assert.match(fn, /premiumFailureCategory/);
  });

  it("job queue stores renderer + premium failure on success", () => {
    const queue = read("src/lib/services/whatsapp/jobQueue.ts");
    assert.match(queue, /premiumFailureCategory: sendMeta\.premiumFailureCategory/);
    assert.match(queue, /isPremiumRenderFailureRetryable/);
  });

  it("non-retryable premium failures are not WhatsApp render retry reasons", () => {
    const msg = `${PREMIUM_SLIP_RENDER_FAILED}: Failed to launch browser process libnss3.so`;
    assert.equal(isPremiumSlipRenderFailureMessage(msg), true);
    assert.equal(isWhatsAppRenderFailureReason(msg), false);
  });

  it("transient Meta errors remain retryable (not premium render)", () => {
    assert.equal(isWhatsAppRenderFailureReason("Meta API rate limit exceeded"), false);
    assert.equal(isWhatsAppRenderFailureReason("ETXTBSY: text file busy"), true);
  });

  it("manual retry uses atomic updateMany to avoid duplicate sends", () => {
    const queue = read("src/lib/services/whatsapp/jobQueue.ts");
    assert.match(queue, /updateMany/);
    assert.match(queue, /canSafelyRetryWhatsAppJob/);
  });
});

describe("slipRenderWithFallback module", () => {
  it("exports structured renderer logging without customer fields", () => {
    const mod = read("src/lib/services/whatsapp/slipRenderWithFallback.ts");
    assert.match(mod, /event: "slip_renderer"/);
    assert.match(mod, /premiumFailureCategory/);
    assert.doesNotMatch(mod, /customerName|phone|contact/i);
  });
});
