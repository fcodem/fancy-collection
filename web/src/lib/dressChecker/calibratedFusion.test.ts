import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calibrateEnterpriseGptFusion,
  ENTERPRISE_GPT_WEIGHT,
  ENTERPRISE_STRUCTURAL_WEIGHT,
  computeEnterpriseMatchScore,
} from "./enterpriseMatchScore";

describe("calibrated GPT fusion", () => {
  it("uses 75/25 structural/GPT weights", () => {
    assert.equal(ENTERPRISE_STRUCTURAL_WEIGHT, 0.75);
    assert.equal(ENTERPRISE_GPT_WEIGHT, 0.25);
  });

  it("sameCollection caps below exact match", () => {
    const r = calibrateEnterpriseGptFusion({
      visualScore: 90,
      gptScore: 80,
      hasGpt: true,
      verdict: "sameCollection",
      gptConfidence: 80,
    });
    assert.ok(r.finalScore <= 84);
    assert.match(r.formula, /sameCollection/);
  });

  it("sameDress blends 75/25 when structure credible", () => {
    const r = calibrateEnterpriseGptFusion({
      visualScore: 80,
      gptScore: 100,
      hasGpt: true,
      verdict: "sameDress",
      gptConfidence: 95,
    });
    assert.equal(r.finalScore, Math.round(80 * 0.75 + 100 * 0.25));
  });

  it("insufficientEvidence retains visual", () => {
    const r = calibrateEnterpriseGptFusion({
      visualScore: 77,
      gptScore: 50,
      hasGpt: true,
      verdict: "insufficientEvidence",
    });
    assert.equal(r.finalScore, 77);
  });

  it("does not hard-reject colour 16.7 with strong bridal structure", () => {
    const r = computeEnterpriseMatchScore({
      embedding: 96,
      embroidery: 80,
      border: 65,
      colour: 16.7,
      motif: 88,
      panel: 90,
      identity: 74,
    });
    assert.equal(r.rejected, false);
  });
});
