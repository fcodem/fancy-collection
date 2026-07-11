import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldCallOpenAiForScore,
  OPENAI_USAGE_POLICY,
  FORENSIC_PROMPT,
  FINGERPRINT_PROMPT,
} from "./openaiBridalForensics";
import { parseVerificationPayload } from "./vlmIdentity";

describe("OpenAI bridal forensics policy", () => {
  it("auto-accepts above 92 without GPT", () => {
    assert.equal(shouldCallOpenAiForScore(93), "auto_accept");
    assert.equal(shouldCallOpenAiForScore(99), "auto_accept");
  });

  it("verifies only ambiguous 70–92 band", () => {
    assert.equal(shouldCallOpenAiForScore(70), "verify");
    assert.equal(shouldCallOpenAiForScore(85), "verify");
    assert.equal(shouldCallOpenAiForScore(92), "verify");
  });

  it("rejects below 70 without GPT", () => {
    assert.equal(shouldCallOpenAiForScore(69), "reject");
    assert.equal(shouldCallOpenAiForScore(0), "reject");
  });

  it("limits GPT to top 3 after region rerank", () => {
    assert.equal(OPENAI_USAGE_POLICY.verifyTopN, 3);
    assert.equal(OPENAI_USAGE_POLICY.annLimit, 100);
    assert.equal(OPENAI_USAGE_POLICY.fingerprintTopN, 20);
    assert.equal(OPENAI_USAGE_POLICY.regionTopN, 10);
    assert.equal(OPENAI_USAGE_POLICY.maxOpenAiCallsPerSearch, 1);
  });

  it("forensic prompt prevents same-collection false positives", () => {
    assert.match(FORENSIC_PROMPT, /sameCollection/);
    assert.match(FORENSIC_PROMPT, /ONION BRIDAL/);
    assert.match(FORENSIC_PROMPT, /Border sequence/);
  });

  it("fingerprint prompt extracts garment-only properties", () => {
    assert.match(FINGERPRINT_PROMPT, /Ignore/);
    assert.match(FINGERPRINT_PROMPT, /uniqueIdentifiers/);
    assert.match(FINGERPRINT_PROMPT, /panelSequence/);
  });

  it("parses sameCollection lookalike as not sameDress", () => {
    const parsed = parseVerificationPayload(`{
      "sameDress": true,
      "sameCollection": true,
      "confidence": 80,
      "reasoning": "Similar embroidery but border motifs differ",
      "differences": ["border motifs differ"],
      "similarities": ["colour family"],
      "matchedIdentifiers": ["pink palette"]
    }`);
    assert.equal(parsed?.sameCollection, true);
    assert.equal(parsed?.sameDress, false);
    assert.ok((parsed?.confidence ?? 100) <= 69);
  });
});
