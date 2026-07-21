import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VERCEL_WHATSAPP_MAX_DURATION_MS,
  WHATSAPP_CRON_SAFE_BUDGET_MS,
  WHATSAPP_SLIP_JOB_TIMEOUT_MS,
  WHATSAPP_TEXT_JOB_TIMEOUT_MS,
  WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS,
  WHATSAPP_MIN_REMAINING_TO_START_SLIP_MS,
  WHATSAPP_MIN_REMAINING_TO_START_TEXT_MS,
  WHATSAPP_STUCK_PROCESSING_MS,
  canStartWhatsAppJobWithBudget,
  isHeavyWhatsAppJobType,
  isLightWhatsAppJobType,
} from "./services/whatsapp/whatsappRuntime";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("WhatsApp runtime budget", () => {
  it("heavy job timeout stays below Vercel max duration", () => {
    assert.ok(WHATSAPP_SLIP_JOB_TIMEOUT_MS < VERCEL_WHATSAPP_MAX_DURATION_MS);
    assert.ok(WHATSAPP_SLIP_JOB_TIMEOUT_MS <= 38_000);
  });

  it("renderer timeout stays below heavy job timeout", () => {
    assert.ok(WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS < WHATSAPP_SLIP_JOB_TIMEOUT_MS);
  });

  it("cron safe budget stays below Vercel max duration", () => {
    assert.ok(WHATSAPP_CRON_SAFE_BUDGET_MS < VERCEL_WHATSAPP_MAX_DURATION_MS);
    assert.ok(WHATSAPP_CRON_SAFE_BUDGET_MS <= 45_000);
  });

  it("text job timeout stays below cron budget", () => {
    assert.ok(WHATSAPP_TEXT_JOB_TIMEOUT_MS < WHATSAPP_CRON_SAFE_BUDGET_MS);
  });

  it("stuck recovery exceeds heavy job timeout", () => {
    assert.ok(WHATSAPP_STUCK_PROCESSING_MS > WHATSAPP_SLIP_JOB_TIMEOUT_MS);
  });

  it("classifies heavy vs light jobs", () => {
    assert.equal(isHeavyWhatsAppJobType("booking_bill"), true);
    assert.equal(isHeavyWhatsAppJobType("delivery_slip"), true);
    assert.equal(isHeavyWhatsAppJobType("postponement_held"), true);
    assert.equal(isLightWhatsAppJobType("postponement_notice"), true);
    assert.equal(isHeavyWhatsAppJobType("postponement_notice"), false);
  });

  it("blocks heavy job when remaining budget is insufficient", () => {
    assert.equal(
      canStartWhatsAppJobWithBudget("booking_bill", WHATSAPP_MIN_REMAINING_TO_START_SLIP_MS - 1, 0, 1),
      false,
    );
    assert.equal(
      canStartWhatsAppJobWithBudget("postponement_notice", WHATSAPP_MIN_REMAINING_TO_START_TEXT_MS, 0, 1),
      true,
    );
  });

  it("allows only one heavy job per invocation", () => {
    assert.equal(canStartWhatsAppJobWithBudget("booking_bill", 50_000, 1, 1), false);
  });
});

describe("WhatsApp queue implementation guards", () => {
  const jobQueue = read("src/lib/services/whatsapp/jobQueue.ts");
  const slipHtml = read("src/lib/services/whatsapp/slipHtmlPdf.server.ts");
  const automated = read("src/lib/services/whatsapp/automatedMessages.ts");
  const client = read("src/components/PremiumSlipTestClient.tsx");

  it("does not keep 120_000 WhatsApp job timeout", () => {
    assert.doesNotMatch(jobQueue, /JOB_TIMEOUT_MS\s*=\s*120_000/);
  });

  it("claims and releases jobs with remaining budget checks", () => {
    assert.match(jobQueue, /canStartWhatsAppJobWithBudget/);
    assert.match(jobQueue, /releaseWhatsAppJobWithoutAttempt/);
    assert.match(jobQueue, /claimWhatsAppJobById/);
    assert.match(jobQueue, /maxHeavyJobs/);
  });

  it("passes AbortSignal through renderSlipViaEndpoint", () => {
    assert.match(slipHtml, /abortSignal|signal: controller\.signal/);
    assert.match(slipHtml, /WHATSAPP_RENDERER_REQUEST_TIMEOUT_MS|31_000/);
    assert.match(automated, /slipRenderFetchOpts/);
  });

  it("customer automated path has no jsPDF fallback", () => {
    assert.doesNotMatch(automated, /renderSlipWithFallback/);
    assert.doesNotMatch(automated, /generateBookingBillPdfFallback/);
    assert.doesNotMatch(automated, /generateOperationSlipPdfFallback/);
  });

  it("owner premium slip test page never defaults customer WhatsApp", () => {
    assert.doesNotMatch(client, /8077843874/);
    assert.doesNotMatch(client, /whatsappNo/);
    assert.match(client, /Approved WhatsApp test number/);
  });

  it("premium slip test routes exist", () => {
    assert.ok(fs.existsSync(path.join(root, "src/app/admin/premium-slip-test/page.tsx")));
    assert.ok(fs.existsSync(path.join(root, "src/app/api/admin/test-all-premium-slips/route.ts")));
    assert.ok(fs.existsSync(path.join(root, "src/app/api/admin/test-all-premium-slips/status/route.ts")));
  });

  it("premium slip roots are documented in validation", () => {
    const validation = read("src/lib/premiumSlipHtmlValidation.ts");
    assert.match(validation, /booking-slip-root/);
    assert.match(validation, /delivery-slip-root/);
    assert.match(validation, /return-slip-root/);
    assert.match(validation, /incomplete-slip-root/);
    assert.match(validation, /data-premium-slip/);
    assert.match(validation, /PREMIUM_SLIP_TEMPLATE_VERSION|data-template-version/);
  });
});

describe("Render timeout classification", () => {
  it("timeout before Meta is FAILED_BEFORE_PROVIDER not provider unknown", async () => {
    const { providerOutcomeForFailure, sendStageForFailure } = await import(
      "./services/whatsapp/whatsappProviderOutcome"
    );
    const error = "PREMIUM_SLIP_RENDER_FAILED: Premium slip rendering timed out — Meta was not contacted.";
    assert.equal(providerOutcomeForFailure(error, null), "NOT_ATTEMPTED");
    assert.equal(sendStageForFailure(error, null), "FAILED_BEFORE_PROVIDER");
    assert.equal(sendStageForFailure(error, { sendStartedAt: null }), "FAILED_BEFORE_PROVIDER");
  });

  it("provider unknown only when ledger shows send started", async () => {
    const { sendStageForFailure } = await import("./services/whatsapp/whatsappProviderOutcome");
    assert.equal(
      sendStageForFailure("Meta timeout", { sendStartedAt: new Date(), sendConfirmedAt: null }),
      "PROVIDER_OUTCOME_UNKNOWN",
    );
  });
});
