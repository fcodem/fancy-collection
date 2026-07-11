import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  catalogPhotoRef,
  inventoryPhotoRef,
  recognitionPhotoRef,
  slipOutfitPhotoRef,
} from "./catalogPhotoRef";

describe("inventoryPhotoRef", () => {
  it("returns empty string for undefined, null, and empty object", () => {
    assert.equal(inventoryPhotoRef(undefined), "");
    assert.equal(inventoryPhotoRef(null), "");
    assert.equal(inventoryPhotoRef({}), "");
  });

  it("falls back to photo when no enhanced or original", () => {
    assert.equal(inventoryPhotoRef({ photo: "a.jpg" }), "a.jpg");
  });

  it("uses latest photo while auto-enhancement is paused (ignores enhancedPhoto)", () => {
    // AUTO_IMAGE_ENHANCEMENT_ENABLED is currently false — display the upload only.
    assert.equal(
      inventoryPhotoRef({ photo: "a.jpg", originalPhoto: "orig.jpg", enhancedPhoto: "enh.jpg" }),
      "a.jpg",
    );
  });

  it("prefers photo over a stale originalPhoto", () => {
    assert.equal(
      inventoryPhotoRef({ photo: "new.jpg", originalPhoto: "old.jpg" }),
      "new.jpg",
    );
  });

  it("falls back to photo when originalPhoto and enhancedPhoto are null", () => {
    assert.equal(
      inventoryPhotoRef({ photo: "a.jpg", originalPhoto: null, enhancedPhoto: null }),
      "a.jpg",
    );
  });
});

describe("catalogPhotoRef", () => {
  it("always returns the uploaded photo regardless of variant", () => {
    assert.equal(catalogPhotoRef({ photo: "a.jpg" }), "a.jpg");
    assert.equal(catalogPhotoRef({ photo: "a.jpg" }, "booking_slip"), "a.jpg");
    assert.equal(catalogPhotoRef({ photo: "a.jpg" }, "whatsapp"), "a.jpg");
  });

  it("never throws on partially-created items", () => {
    assert.doesNotThrow(() => catalogPhotoRef(undefined, "showcase"));
    assert.doesNotThrow(() => catalogPhotoRef(null, "booking_slip"));
  });
});

describe("slipOutfitPhotoRef", () => {
  it("returns the uploaded photo", () => {
    assert.equal(slipOutfitPhotoRef({ photo: "a.jpg" }), "a.jpg");
  });
});

describe("recognitionPhotoRef", () => {
  it("returns empty string for undefined and null", () => {
    assert.equal(recognitionPhotoRef(undefined), "");
    assert.equal(recognitionPhotoRef(null), "");
  });

  it("uses uploaded photo while enhancement is paused (ignores recognitionImage)", () => {
    assert.equal(
      recognitionPhotoRef({ photo: "a.jpg", recognitionImage: "rec.jpg" }),
      "a.jpg",
    );
  });

  it("falls back to uploaded photo", () => {
    assert.equal(recognitionPhotoRef({ photo: "a.jpg" }), "a.jpg");
  });
});
