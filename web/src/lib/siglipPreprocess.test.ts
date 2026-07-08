import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareSiglipMasterImage, extractSiglipCrop } from "./siglipPreprocess";

describe("siglipPreprocess", () => {
  it("preserves aspect ratio on master prepare", async () => {
    const portrait = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: { r: 10, g: 128, b: 10 } },
    })
      .jpeg()
      .toBuffer();
    const out = await prepareSiglipMasterImage(portrait);
    const meta = await sharp(out).metadata();
    assert.ok(meta.width && meta.height);
    assert.ok(meta.width < meta.height);
    assert.ok(meta.width! <= 2048);
  });

  it("extractSiglipCrop does not upscale small regions", async () => {
    const master = await prepareSiglipMasterImage(
      await sharp({
        create: { width: 600, height: 900, channels: 3, background: { r: 200, g: 50, b: 50 } },
      })
        .jpeg()
        .toBuffer(),
    );
    const crop = await extractSiglipCrop(master, {
      wRatio: 0.5,
      hRatio: 0.3,
      leftRatio: 0.25,
      topRatio: 0.35,
    });
    const meta = await sharp(crop).metadata();
    assert.ok(meta.width && meta.height);
    assert.ok(meta.width <= 400);
  });
});
