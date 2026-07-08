import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  hashSimilarity,
  histogramSimilarity,
  combinedImageSimilarity,
  blendVisualSearchScore,
  applyColorGate,
  finalPhotoSearchScore,
  computeImageFingerprint,
  PHOTO_MATCH_MIN_SCORE,
  type ImageFingerprint,
} from "./photoHash";

function fp(
  avg: bigint,
  diff: bigint,
  hist: number[],
  colorFamily: import("./photoHash").FabricColorFamily = "unknown",
): ImageFingerprint {
  return { averageHash: avg, differenceHash: diff, colorHistogram: hist, colorFamily };
}

describe("photoHash", () => {
  it("identical hashes score 100%", () => {
    const h = BigInt("0xFFFF");
    assert.equal(hashSimilarity(h, h), 100);
  });

  it("histogram intersection is 100% for identical colour profiles", () => {
    const hist = [0.5, 0.3, 0.2];
    assert.equal(histogramSimilarity(hist, hist), 100);
  });

  it("combined score favours matching colour over mismatched structure", () => {
    const navy = [0, 0, 0.6, 0, 0, 0.3, 0, 0, 0.1];
    const sameDress = fp(BigInt(0), BigInt(0), navy);
    const otherDress = fp(BigInt("0xFFFFFFFFFFFFFFFF"), BigInt("0xFFFFFFFFFFFFFFFF"), [0.6, 0.3, 0.1, 0, 0, 0, 0, 0, 0]);
    const score = combinedImageSimilarity(sameDress, otherDress);
    assert.ok(score >= PHOTO_MATCH_MIN_SCORE);
  });

  it("minimum match threshold is low enough for angle variants", () => {
    assert.ok(PHOTO_MATCH_MIN_SCORE <= 30);
  });

  it("blendVisualSearchScore favours design when colours are similar", () => {
    const exact = blendVisualSearchScore(90, 95);
    const sibling = blendVisualSearchScore(88, 52);
    assert.ok(exact > sibling);
  });

  it("blendVisualSearchScore penalises design when colours diverge", () => {
    const mismatch = blendVisualSearchScore(18, 72);
    const match = blendVisualSearchScore(72, 70);
    assert.ok(match > mismatch);
  });

  it("applyColorGate drops blue candidate for green query", () => {
    const blueVisual = blendVisualSearchScore(16, 68);
    const greenVisual = blendVisualSearchScore(74, 65);
    const blueFinal = finalPhotoSearchScore(55, blueVisual, 16, 68, 0);
    const greenFinal = finalPhotoSearchScore(50, greenVisual, 74, 65, 100);
    assert.ok(greenFinal > blueFinal);
  });

  it("finalPhotoSearchScore favours AI pattern for same-colour variants", () => {
    const cutdana2 = finalPhotoSearchScore(88, 46, 62, 43, 100);
    const cutdana3 = finalPhotoSearchScore(52, 70, 87, 67, 100);
    assert.ok(cutdana2 > cutdana3);
  });

  it("finalPhotoSearchScore hard-rejects green vs blue family", () => {
    const blue = finalPhotoSearchScore(70, 64, 65, 64, 0);
    const green = finalPhotoSearchScore(50, 51, 64, 50, 100);
    assert.ok(green > blue);
    assert.ok(blue <= 12);
  });

  it("computeImageFingerprint handles portrait and tiny images without extract errors", async () => {
    const portrait = await sharp({
      create: { width: 120, height: 300, channels: 3, background: { r: 20, g: 80, b: 160 } },
    })
      .jpeg()
      .toBuffer();
    const tiny = await sharp({
      create: { width: 3, height: 3, channels: 3, background: { r: 200, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();

    const fpPortrait = await computeImageFingerprint(portrait);
    const fpTiny = await computeImageFingerprint(tiny);
    assert.ok(fpPortrait.averageHash > BigInt(0) || fpPortrait.differenceHash > BigInt(0));
    assert.equal(fpTiny.colorHistogram.length, 36);
  });
});
