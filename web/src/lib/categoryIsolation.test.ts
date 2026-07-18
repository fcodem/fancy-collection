import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("category query isolation", () => {
  it("QR scanner does not import or prefetch category-backed routes on mount", () => {
    const qr = source("src/components/SearchQrClient.tsx");
    assert.doesNotMatch(qr, /getAllCategories|customCategory|hiddenCategory/);
    assert.doesNotMatch(qr, /qrTargetPrefetchFamily|prefetch\(.*navigateTarget/);
  });

  it("booking record does not load categories", () => {
    const booking = source("src/app/booking/[id]/page.tsx");
    assert.doesNotMatch(booking, /getAllCategories|customCategory|hiddenCategory/);
  });

  it("category selector pages explicitly request the category service", () => {
    const bookingForm = source("src/app/booking/new/page.tsx");
    const jewellery = source("src/app/jewellery-selection/[id]/page.tsx");
    assert.match(bookingForm, /getAllCategories/);
    assert.match(jewellery, /getAllCategories/);
  });

  it("category mutations invalidate the dedicated cache", () => {
    const admin = source("src/lib/services/adminOps.ts");
    assert.match(admin, /addCustomCategory[\s\S]*?invalidateCategoryCache/);
    assert.match(admin, /removeCustomCategory[\s\S]*?invalidateCategoryCache/);
    assert.match(admin, /updateCustomCategory[\s\S]*?invalidateCategoryCache/);
    assert.match(admin, /hideCategory[\s\S]*?invalidateCategoryCache/);
  });
});
