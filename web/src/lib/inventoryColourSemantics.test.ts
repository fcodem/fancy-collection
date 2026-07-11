import { describe, expect, it } from "vitest";
import {
  areColourFamiliesIncompatible,
  dominantColorFamiliesMismatch,
  rejectIncompatibleColourFamily,
  isPinkColourName,
} from "./inventoryColourSemantics";

describe("colour family hard rejection", () => {
  it("rejects pink ↔ blue immediately", () => {
    expect(areColourFamiliesIncompatible("pink", "blue")).toBe(true);
    expect(dominantColorFamiliesMismatch("pink", "blue")).toBe(true);
  });

  it("rejects pink ↔ green and pink ↔ yellow", () => {
    expect(areColourFamiliesIncompatible("pink", "green")).toBe(true);
    expect(areColourFamiliesIncompatible("pink", "yellow")).toBe(true);
  });

  it("allows pink ↔ pink (dusty/rose/mauve/blush are same family)", () => {
    expect(areColourFamiliesIncompatible("pink", "pink")).toBe(false);
    expect(isPinkColourName("dusty pink")).toBe(true);
    expect(isPinkColourName("rose pink")).toBe(true);
    expect(isPinkColourName("mauve")).toBe(true);
    expect(isPinkColourName("blush pink")).toBe(true);
  });

  it("pre-rerank gate rejects BLUE CUTDANA on pink query via name", () => {
    const r = rejectIncompatibleColourFamily({
      queryFamily: "pink",
      inventoryFamily: "multi", // stale fingerprint
      inventoryName: "BLUE CUTDANA 2",
      inventoryColor: "",
    });
    expect(r.rejected).toBe(true);
    expect(r.reason).toMatch(/pink ↔ blue/i);
  });

  it("pre-rerank gate allows ONION BRIDAL on pink query", () => {
    const r = rejectIncompatibleColourFamily({
      queryFamily: "pink",
      inventoryFamily: "pink",
      inventoryName: "ONION BRIDAL",
    });
    expect(r.rejected).toBe(false);
  });

  it("does not hard-reject multi without name metadata", () => {
    const r = rejectIncompatibleColourFamily({
      queryFamily: "pink",
      inventoryFamily: "multi",
      inventoryName: "MULTI RAJWADA",
    });
    expect(r.rejected).toBe(false);
  });
});
