import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PROVIDER_OUTCOME_UNKNOWN_PREFIX,
  canSafelyRetryWhatsAppJob,
  formatJobFailedReason,
  isPremiumSlipRenderFailureMessage,
  isWhatsAppRenderFailureReason,
  providerOutcomeForFailure,
  shouldTreatAsProviderOutcomeUnknown,
} from "./whatsappProviderOutcome";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("whatsappProviderOutcome", () => {
  it("detects premium slip render failures", () => {
    assert.equal(isPremiumSlipRenderFailureMessage("PREMIUM_SLIP_RENDER_FAILED: HTML failed"), true);
    assert.equal(isPremiumSlipRenderFailureMessage("PREMIUM_SLIP_HTML_VALIDATION_FAILED: missing marker"), true);
    assert.equal(isPremiumSlipRenderFailureMessage("Network timeout"), false);
  });

  it("render failure is NOT_ATTEMPTED even if ledger has sendStartedAt", () => {
    const ledger = { sendStartedAt: new Date(), sendConfirmedAt: null, providerMessageId: null };
    const error = "PREMIUM_SLIP_RENDER_FAILED: Premium slip validation failed";
    assert.equal(providerOutcomeForFailure(error, ledger), "NOT_ATTEMPTED");
    assert.equal(shouldTreatAsProviderOutcomeUnknown(error, ledger), false);
  });

  it("provider unknown only when Meta was dispatched without confirmation", () => {
    const ledger = { sendStartedAt: new Date(), sendConfirmedAt: null, providerMessageId: null };
    const error = "Meta API timeout";
    assert.equal(providerOutcomeForFailure(error, ledger), "UNKNOWN");
    assert.equal(
      formatJobFailedReason(error, ledger).startsWith(PROVIDER_OUTCOME_UNKNOWN_PREFIX),
      true,
    );
  });

  it("canSafelyRetryWhatsAppJob blocks confirmed Meta message ID", () => {
    const blocked = canSafelyRetryWhatsAppJob({
      status: "failed",
      failedReason: "PREMIUM_SLIP_RENDER_FAILED: x",
      payload: { metaMessageId: "wamid.123" },
    });
    assert.equal(blocked.ok, false);
  });

  it("canSafelyRetryWhatsAppJob allows render failure retry", () => {
    const ok = canSafelyRetryWhatsAppJob({
      status: "failed",
      failedReason: "PREMIUM_SLIP_RENDER_FAILED: missing marker",
      payload: {},
    });
    assert.equal(ok.ok, true);
  });

  it("canSafelyRetryWhatsAppJob blocks second safe render retry", () => {
    const blocked = canSafelyRetryWhatsAppJob({
      status: "failed",
      failedReason: "PREMIUM_SLIP_RENDER_FAILED: x",
      payload: { safeRenderRetryCount: 1 },
      allowSafeRenderRetry: true,
    });
    assert.equal(blocked.ok, false);
  });

  it("detects infrastructure render failure reasons", () => {
    assert.equal(isWhatsAppRenderFailureReason("Slip PDF render failed: /tmp full (ENOSPC)"), true);
  });

  it("canSafelyRetryWhatsAppJob blocks provider-outcome-unknown auto resend", () => {
    const blocked = canSafelyRetryWhatsAppJob({
      status: "failed",
      failedReason: `${PROVIDER_OUTCOME_UNKNOWN_PREFIX} timeout`,
      payload: {},
    });
    assert.equal(blocked.ok, false);
  });

  it("job queue defers provider send fence until Meta dispatch", () => {
    const source = read("src/lib/services/whatsapp/jobQueue.ts");
    assert.match(source, /providerOutcomeForFailure/);
    assert.match(source, /markWhatsAppProviderSendConfirmed/);
    assert.doesNotMatch(
      source.slice(source.indexOf("export async function processWhatsAppJobQueue")),
      /sendStartedAt: new Date\(\)/,
    );
  });

  it("automated slip sends mark provider started immediately before Meta", () => {
    const source = read("src/lib/services/whatsapp/automatedMessages.ts");
    assert.match(source, /beginWhatsAppProviderSend/);
    assert.match(source, /markWhatsAppProviderSendStarted/);
  });
});
