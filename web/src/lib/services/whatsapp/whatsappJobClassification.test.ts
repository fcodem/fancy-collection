import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyWhatsAppJobFailure,
  type ClassifiedWhatsAppJobFailure,
} from "./whatsappJobClassification";
import {
  canSafelyRequeueRenderFailure,
  isWhatsAppRenderFailureReason,
} from "./whatsappProviderOutcome";

function job(overrides: Partial<Parameters<typeof classifyWhatsAppJobFailure>[0]> = {}) {
  return {
    id: 1,
    jobType: "delivery_slip",
    bookingId: 100,
    status: "failed",
    attempts: 3,
    maxAttempts: 3,
    idempotencyKey: "delivery_slip:100:v1",
    failedReason: "PREMIUM_SLIP_RENDER_FAILED: missing marker",
    payload: {},
    ...overrides,
  };
}

describe("whatsappJobClassification", () => {
  it("classifies render failure without Meta confirmation as safe", () => {
    const row = classifyWhatsAppJobFailure(job(), null);
    assert.equal(row.bucket, "SAFE_RENDER_RETRY");
    assert.equal(row.safeToRequeue, true);
    assert.equal(row.failureBeforeProvider, true);
    assert.equal(row.metaCalled, false);
  });

  it("withholds jobs with confirmed Meta message ID", () => {
    const row = classifyWhatsAppJobFailure(
      job({ payload: { metaMessageId: "wamid.abc" } }),
      null,
    );
    assert.equal(row.bucket, "WITHHELD_META_CONFIRMED");
    assert.equal(row.safeToRequeue, false);
  });

  it("withholds provider-outcome-unknown jobs", () => {
    const row = classifyWhatsAppJobFailure(
      job({ failedReason: "PROVIDER_OUTCOME_UNKNOWN: Meta timeout" }),
      { sendStartedAt: new Date(), sendConfirmedAt: null, providerMessageId: null },
    );
    assert.equal(row.bucket, "WITHHELD_PROVIDER_UNKNOWN");
    assert.equal(row.safeToRequeue, false);
  });

  it("marks stale sendStartedAt on render failures", () => {
    const row = classifyWhatsAppJobFailure(job(), {
      sendStartedAt: new Date(),
      sendConfirmedAt: null,
      providerMessageId: null,
    });
    assert.equal(row.staleSendStartedAt, true);
    assert.equal(row.failureBeforeProvider, true);
  });

  it("detects infrastructure errors in failed reason", () => {
    assert.equal(isWhatsAppRenderFailureReason("Slip PDF render failed: Chromium busy (ETXTBSY)"), true);
    assert.equal(isWhatsAppRenderFailureReason("Meta API timeout"), false);
  });

  it("blocks second safe render retry", () => {
    const gate = canSafelyRequeueRenderFailure({
      status: "failed",
      failedReason: "PREMIUM_SLIP_RENDER_FAILED: x",
      payload: { safeRenderRetryCount: 1 },
      ledger: null,
    });
    assert.equal(gate.ok, false);
  });
});

describe("whatsappJobClassification buckets", () => {
  it("withholds after one safe render retry", () => {
    const row: ClassifiedWhatsAppJobFailure = classifyWhatsAppJobFailure(
      job({ payload: { safeRenderRetryCount: 1 } }),
      null,
    );
    assert.equal(row.bucket, "WITHHELD_ALREADY_SAFE_RETRIED");
  });
});
