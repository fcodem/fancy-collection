import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildRecognitionImage } from "./recognitionPreprocess";

async function makeTestImage(
  width: number,
  height: number,
  channels: 3 | 4 = 3,
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels, background: { r: 120, g: 80, b: 60, alpha: 200 } },
  })
    .jpeg()
    .toBuffer();
}

describe("buildRecognitionImage", () => {
  it("produces a JPEG buffer", async () => {
    const input = await makeTestImage(400, 600);
    const result = await buildRecognitionImage(input);

    assert.ok(Buffer.isBuffer(result));
    const meta = await sharp(result).metadata();
    assert.equal(meta.format, "jpeg");
  });

  it("preserves aspect ratio", async () => {
    const input = await makeTestImage(800, 1200);
    const result = await buildRecognitionImage(input);
    const meta = await sharp(result).metadata();

    const ratio = (meta.width ?? 1) / (meta.height ?? 1);
    const expected = 800 / 1200;
    assert.ok(Math.abs(ratio - expected) < 0.05, `aspect ratio preserved: ${ratio} ≈ ${expected}`);
  });

  it("caps large images at 2048px", async () => {
    const input = await makeTestImage(4000, 3000);
    const result = await buildRecognitionImage(input);
    const meta = await sharp(result).metadata();

    assert.ok((meta.width ?? 0) <= 2048, `width <= 2048: ${meta.width}`);
    assert.ok((meta.height ?? 0) <= 2048, `height <= 2048: ${meta.height}`);
  });

  it("does not enlarge small images", async () => {
    const input = await makeTestImage(200, 300);
    const result = await buildRecognitionImage(input);
    const meta = await sharp(result).metadata();

    assert.ok((meta.width ?? 0) <= 200, `width not enlarged: ${meta.width}`);
    assert.ok((meta.height ?? 0) <= 300, `height not enlarged: ${meta.height}`);
  });

  it("removes alpha channel", async () => {
    const input = await makeTestImage(256, 256, 4);
    const result = await buildRecognitionImage(input);
    const meta = await sharp(result).metadata();

    assert.ok(!meta.hasAlpha, "alpha channel removed");
  });
});
