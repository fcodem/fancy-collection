import { describe, expect, it } from "vitest";
import { classifyLabColour } from "./dressColourLab";

describe("classifyLabColour pink family", () => {
  it("maps dusty pink LAB to pink family", () => {
    const r = classifyLabColour({ L: 68, a: 14, b: 6 });
    expect(r.family).toBe("pink");
    expect(r.name).toMatch(/pink|blush|onion|dusty|rose|mauve/i);
  });

  it("maps darker muted bridal pink (onion) correctly", () => {
    const r = classifyLabColour({ L: 42, a: 10, b: 5 });
    expect(r.family).toBe("pink");
    expect(r.name).toMatch(/onion|dusty|pink/i);
  });

  it("maps near-grey warm fabric to pink not grey", () => {
    const r = classifyLabColour({ L: 54, a: 5.3, b: 5.6 });
    expect(r.family).toBe("pink");
  });

  it("maps onion/rose-like LAB to pink", () => {
    expect(classifyLabColour({ L: 60, a: 18, b: 10 }).family).toBe("pink");
    expect(classifyLabColour({ L: 55, a: 12, b: 0 }).family).toBe("pink");
  });

  it("does not classify navy as pink", () => {
    expect(classifyLabColour({ L: 30, a: 5, b: -25 }).family).toBe("blue");
  });

  it("classifies low-chroma grey as neutral", () => {
    expect(classifyLabColour({ L: 55, a: 1, b: 1 }).family).toBe("neutral");
  });
});
