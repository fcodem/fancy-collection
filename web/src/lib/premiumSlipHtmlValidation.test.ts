import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PREMIUM_SLIP_HTML_VALIDATION_FAILED,
  PREMIUM_SLIP_REQUIRED_SECTIONS,
  PremiumSlipHtmlValidationError,
  validatePremiumSlipDomSnapshot,
  type PremiumSlipDomSnapshot,
} from "./premiumSlipHtmlValidation";
import { premiumSlipMarker } from "./premiumSlip";

function validSnapshot(kind: keyof typeof PREMIUM_SLIP_REQUIRED_SECTIONS): PremiumSlipDomSnapshot {
  return {
    rootPresent: true,
    marker: {
      premiumSlip: premiumSlipMarker(kind),
      slipKind: kind,
      templateVersion: "premium-slip-v1",
    },
    sections: [...PREMIUM_SLIP_REQUIRED_SECTIONS[kind]],
  };
}

describe("premiumSlipHtmlValidation", () => {
  for (const kind of ["booking", "delivery", "return", "incomplete"] as const) {
    it(`${kind} slip passes with required sections`, () => {
      assert.doesNotThrow(() => validatePremiumSlipDomSnapshot(kind, validSnapshot(kind)));
    });
  }

  it("rejects missing DOM marker", () => {
    const snapshot = validSnapshot("booking");
    snapshot.marker = null;
    assert.throws(
      () => validatePremiumSlipDomSnapshot("booking", snapshot),
      (err: unknown) =>
        err instanceof PremiumSlipHtmlValidationError &&
        err.code === PREMIUM_SLIP_HTML_VALIDATION_FAILED,
    );
  });

  it("rejects wrong slip kind", () => {
    const snapshot = validSnapshot("booking");
    snapshot.marker!.slipKind = "delivery";
    assert.throws(() => validatePremiumSlipDomSnapshot("booking", snapshot), PremiumSlipHtmlValidationError);
  });

  it("rejects wrong template version", () => {
    const snapshot = validSnapshot("delivery");
    snapshot.marker!.templateVersion = "legacy-v0";
    assert.throws(() => validatePremiumSlipDomSnapshot("delivery", snapshot), PremiumSlipHtmlValidationError);
  });

  it("rejects missing slip root", () => {
    const snapshot = validSnapshot("return");
    snapshot.rootPresent = false;
    assert.throws(() => validatePremiumSlipDomSnapshot("return", snapshot), PremiumSlipHtmlValidationError);
  });
});
