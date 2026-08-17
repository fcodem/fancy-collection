import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { visionMetadataToSearchText } from "./openaiVisionEmbedding";

describe("openai vision embedding text", () => {
  it("joins description, colours, and embroidery into one search string", () => {
    const text = visionMetadataToSearchText({
      visualDescription: "Rani sequin crop top",
      category: "Crop Top",
      primaryColours: ["rani", "gold"],
      embroideryType: "sequin",
      motifs: ["paisley"],
    });
    assert.match(text, /Rani sequin crop top/);
    assert.match(text, /Crop Top/);
    assert.match(text, /rani/);
    assert.match(text, /sequin/);
    assert.match(text, /paisley/);
  });
});
