import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseVerificationPayload, OPENAI_VERIFY_CONFIDENCE } from "./vlmIdentity";

describe("OpenAI bridal verification JSON", () => {
  it("parses sameDress confidence reasoning", () => {
    const raw = `{
  "sameDress": true,
  "confidence": 95,
  "matchedIdentifiers": ["peacock border", "elephant hem", "skirt panel layout"],
  "reasoning": "Same peacock border, elephant hem, and skirt panel layout",
  "differences": []
}`;
    const parsed = parseVerificationPayload(raw);
    assert.equal(parsed?.sameDress, true);
    assert.equal(parsed?.confidence, 95);
    assert.equal(parsed?.matchedIdentifiers.length, 3);
    assert.ok(parsed?.reasoning.includes("peacock"));
  });

  it("forces sameDress when ≥3 bridal identifiers match", () => {
    const raw = `{
  "sameDress": false,
  "confidence": 72,
  "matchedIdentifiers": ["border design", "peacock motif", "embroidery arrangement"],
  "reasoning": "Identifiers align despite mannequin vs worn",
  "differences": []
}`;
    const parsed = parseVerificationPayload(raw);
    assert.equal(parsed?.sameDress, true);
    assert.ok((parsed?.confidence ?? 0) >= OPENAI_VERIFY_CONFIDENCE.possibleMatch);
  });

  it("does not treat colour-only high confidence as same dress", () => {
    const raw = `{
  "sameDress": false,
  "confidence": 88,
  "matchedIdentifiers": ["similar pink colour"],
  "reasoning": "Only colour looks similar",
  "differences": ["different border"]
}`;
    const parsed = parseVerificationPayload(raw);
    assert.equal(parsed?.sameDress, false);
    assert.ok((parsed?.confidence ?? 100) < OPENAI_VERIFY_CONFIDENCE.possibleMatch);
  });

  it("floors sameDress confidence at possible-match band", () => {
    const raw = `{
  "sameDress": true,
  "confidence": 55,
  "matchedIdentifiers": ["a", "b", "c"],
  "reasoning": "Three identifiers",
  "differences": []
}`;
    const parsed = parseVerificationPayload(raw);
    assert.equal(parsed?.sameDress, true);
    assert.equal(parsed?.confidence, OPENAI_VERIFY_CONFIDENCE.possibleMatch);
  });
});
