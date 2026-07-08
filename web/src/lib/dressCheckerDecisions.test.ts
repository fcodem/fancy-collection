import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveIdentificationDecision } from "./dressCheckerDecisions";

const display = (n: string, c: string, s: string | null) => `${n} (${c})`;

describe("dressCheckerDecisions", () => {
  it("identifies when confidence high and gap wide", () => {
    const r = resolveIdentificationDecision(
      [
        { similarity: 96, item: { id: 1, sku: "A", name: "Dress A", photo: "", category: "Lehenga", size: "M" } },
        { similarity: 70, item: { id: 2, sku: "B", name: "Dress B", photo: "", category: "Lehenga", size: "M" } },
      ],
      display,
    );
    assert.equal(r.decision, "identified");
    assert.equal(r.requires_manual_confirmation, false);
  });

  it("flags ambiguous when top two within 3%", () => {
    const r = resolveIdentificationDecision(
      [
        { similarity: 96, item: { id: 1, sku: "A", name: "Dress A", photo: "", category: "Lehenga", size: "M" } },
        { similarity: 94, item: { id: 2, sku: "B", name: "Dress B", photo: "", category: "Lehenga", size: "M" } },
      ],
      display,
    );
    assert.equal(r.decision, "ambiguous");
    assert.equal(r.message, "Multiple possible matches found.");
    assert.equal(r.ambiguous_candidates.length, 2);
  });

  it("unreliable below threshold", () => {
    const r = resolveIdentificationDecision(
      [
        { similarity: 72, item: { id: 1, sku: "A", name: "Dress A", photo: "", category: "Lehenga", size: "M" } },
      ],
      display,
    );
    assert.equal(r.decision, "unreliable");
    assert.equal(r.message, "No reliable identification found.");
  });
});
