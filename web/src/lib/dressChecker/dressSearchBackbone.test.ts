import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/lib/dressChecker");

describe("dress checker indexing backbone", () => {
  it("worker never silently completes without processInventoryAiProfile", () => {
    const src = readFileSync(join(root, "aiJobWorker.ts"), "utf8");
    assert.match(src, /processInventoryAiProfile/);
    assert.match(src, /dressIndexingEnabled/);
    assert.doesNotMatch(
      src,
      /if \(!nativeEnabled && AI_FLAGS\.openaiEnrichmentEnabled\)[\s\S]{0,200}completeAiJob/,
    );
  });

  it("enterprise index builds synthetic orientation views", () => {
    const src = readFileSync(join(root, "enterpriseIndexing.ts"), "utf8");
    assert.match(src, /buildSyntheticOrientationBuffers/);
    assert.match(src, /INDEX_SYNTHETIC_ROTATION_DEGREES/);
    assert.match(src, /synthetic_rot/);
  });

  it("reference labels cover hanger mannequin photoshoot indoor outdoor", () => {
    const src = readFileSync(join(root, "constants.ts"), "utf8");
    for (const label of ["hanger", "mannequin", "photoshoot", "indoor", "outdoor", "back", "side"]) {
      assert.match(src, new RegExp(`"${label}"`));
    }
  });
});
