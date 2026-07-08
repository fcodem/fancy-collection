import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { computeRecognitionFingerprint, type RecognitionFingerprint } from "./recognitionFingerprint";

async function makeTestImage(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
}

describe("computeRecognitionFingerprint", () => {
  it("returns a valid fingerprint structure", async () => {
    const buf = await makeTestImage(256, 256, { r: 120, g: 50, b: 30 });
    const fp = await computeRecognitionFingerprint(buf);

    assert.equal(fp.version, 1);
    assert.ok(Array.isArray(fp.colorHistogram), "colorHistogram is array");
    assert.equal(fp.colorHistogram.length, 36, "36-bin color histogram");
    assert.ok(typeof fp.colorFamily === "string", "colorFamily is string");
    assert.ok(typeof fp.averageHash === "string", "averageHash is string");
    assert.ok(typeof fp.differenceHash === "string", "differenceHash is string");
    assert.ok(Array.isArray(fp.textureDescriptor), "textureDescriptor is array");
    assert.ok(fp.textureDescriptor.length > 0, "textureDescriptor not empty");
    assert.ok(Array.isArray(fp.localKeypoints), "localKeypoints is array");
    assert.ok(Array.isArray(fp.dominantColors), "dominantColors is array");
    assert.ok(fp.dominantColors.length > 0, "has dominant colors");

    assert.ok(fp.regionHashes.centre.aHash, "centre aHash");
    assert.ok(fp.regionHashes.top.aHash, "top aHash");
    assert.ok(fp.regionHashes.bottom.aHash, "bottom aHash");
    assert.ok(fp.regionHashes.left.aHash, "left aHash");
    assert.ok(fp.regionHashes.right.aHash, "right aHash");
  });

  it("produces identical fingerprints for the same image", async () => {
    const buf = await makeTestImage(200, 300, { r: 80, g: 140, b: 60 });
    const fp1 = await computeRecognitionFingerprint(buf);
    const fp2 = await computeRecognitionFingerprint(buf);

    assert.equal(fp1.averageHash, fp2.averageHash);
    assert.equal(fp1.differenceHash, fp2.differenceHash);
    assert.deepEqual(fp1.colorHistogram, fp2.colorHistogram);
    assert.deepEqual(fp1.textureDescriptor, fp2.textureDescriptor);
  });

  it("produces different fingerprints for different images", async () => {
    const red = await makeTestImage(256, 256, { r: 200, g: 30, b: 30 });
    const blue = await makeTestImage(256, 256, { r: 30, g: 30, b: 200 });
    const fpRed = await computeRecognitionFingerprint(red);
    const fpBlue = await computeRecognitionFingerprint(blue);

    const colorMatch = fpRed.colorHistogram.every(
      (v, i) => Math.abs(v - fpBlue.colorHistogram[i]) < 0.01,
    );
    assert.ok(!colorMatch, "different images should have different color histograms");
  });

  it("dominant colors reflect the image", async () => {
    const green = await makeTestImage(256, 256, { r: 20, g: 180, b: 40 });
    const fp = await computeRecognitionFingerprint(green);

    const top = fp.dominantColors[0];
    assert.ok(top.g > top.r && top.g > top.b, "green should dominate");
    assert.ok(top.weight > 0.5, "dominant color should have high weight");
  });
});
