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

  it("returns the uploaded photo", () => {
    assert.equal(inventoryPhotoRef({ photo: "a.jpg" }), "a.jpg");
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

  it("prefers recognition image over photo", () => {
    assert.equal(
      recognitionPhotoRef({ photo: "a.jpg", recognitionImage: "rec.jpg" }),
      "rec.jpg",
    );
  });

  it("falls back to uploaded photo", () => {
    assert.equal(recognitionPhotoRef({ photo: "a.jpg" }), "a.jpg");
  });
});
