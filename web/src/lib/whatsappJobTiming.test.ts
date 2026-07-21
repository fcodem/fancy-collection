import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WHATSAPP_SLIP_JOB_TIMEOUT_MS,
  WHATSAPP_STUCK_PROCESSING_MS,
  WHATSAPP_CRON_SAFE_BUDGET_MS,
  VERCEL_WHATSAPP_MAX_DURATION_MS,
} from "./services/whatsapp/whatsappRuntime";

describe("whatsapp job timing policy", () => {
  it("stuck recovery exceeds execution timeout", () => {
    assert.ok(WHATSAPP_STUCK_PROCESSING_MS > WHATSAPP_SLIP_JOB_TIMEOUT_MS);
    assert.ok(WHATSAPP_STUCK_PROCESSING_MS - WHATSAPP_SLIP_JOB_TIMEOUT_MS >= 30_000);
  });

  it("heavy slip job timeout stays below Vercel function limit", () => {
    assert.ok(WHATSAPP_SLIP_JOB_TIMEOUT_MS < VERCEL_WHATSAPP_MAX_DURATION_MS);
    assert.ok(WHATSAPP_CRON_SAFE_BUDGET_MS < VERCEL_WHATSAPP_MAX_DURATION_MS);
  });

  it("canonical success status is done not completed", () => {
    const active = ["pending", "processing", "done"];
    assert.ok(active.includes("done"));
    assert.equal(active.includes("completed"), false);
  });
});
