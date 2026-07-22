import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decodeCursor, encodeCursor } from "./services/inventoryList";

const root = process.cwd();
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");

describe("inventory keyset and filtering contracts", () => {
  it("carries every newest sort field in the cursor", () => {
    const cursor = {
      sort: "newest" as const,
      v1: "2026-07-18T10:00:00.000Z",
      v2: "Royal Lehenga",
      v3: "group-42",
    };
    assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
  });

  it("applies category and status without losing full group totals", () => {
    const source = read("src/lib/services/inventoryList.ts");
    assert.match(source, /\$\{category\} = '' OR category = \$\{category\}/);
    assert.match(source, /BOOL_OR\(status = \$\{status\}\) AS status_match/);
    assert.match(source, /\$\{status\} = '' OR status_match/);
    assert.match(
      source,
      /sku: \{ equals: q, mode: "insensitive" \}[\s\S]*category[\s\S]*status/,
    );
  });

  it("returns thumbnails in summaries and loads originals only in detail", () => {
    const service = read("src/lib/services/inventoryList.ts");
    const listClient = read("src/components/InventoryListClient.tsx");
    assert.match(service, /\(ARRAY_AGG\(thumbnail_photo/);
    assert.doesNotMatch(service.slice(service.indexOf("WITH base AS"), service.indexOf("async function listInventoryGroupsPrismaFallback")), /original_photo/);
    assert.match(listClient, /fetch\(`\/api\/inventory\/\$\{g\.primaryId\}`/);
    assert.match(listClient, /original_photo_url/);
  });
});

describe("one-click inventory save contracts", () => {
  it("prepares photos in a worker and awaits one shared promise", () => {
    const form = read("src/components/InventoryFormClient.tsx");
    const worker = read("public/inventory-photo-worker.js");
    assert.match(form, /URL\.createObjectURL/);
    assert.match(form, /prepPromiseRef/);
    assert.match(form, /applyPreparedPhoto\(form\)/);
    assert.doesNotMatch(form, /Image is still being prepared/);
    assert.match(worker, /OffscreenCanvas/);
    assert.match(worker, /crypto\.subtle\.digest/);
    assert.match(worker, /720/);
  });

  it("uploads prepared files in one save request and defers AI work until after commit", () => {
    const form = read("src/components/InventoryFormClient.tsx");
    const createRoute = read("src/app/api/inventory/route.ts");
    const operations = read("src/lib/services/inventoryOps.ts");
    assert.match(form, /applyPreparedPhoto\(form\)/);
    assert.doesNotMatch(form, /@vercel\/blob\/client/);
    assert.match(createRoute, /persistInventoryPhotoFromForm/);
    assert.match(createRoute, /after\(async \(\) =>/);
    assert.match(createRoute, /generateDefaultScanCodesInTx/);
    assert.match(operations, /createMany/);
  });

  it("clears photo fields and protects shared references before cleanup", () => {
    const ops = read("src/lib/services/inventoryOps.ts");
    const routes =
      read("src/app/api/inventory/route.ts") +
      read("src/app/api/inventory/[id]/route.ts");
    assert.match(ops, /photo = null/);
    assert.match(ops, /thumbnailPhoto = null/);
    assert.match(ops, /originalPhoto: null/);
    assert.match(ops, /enhancedPhoto: null/);
    assert.match(ops, /marketingPhoto: null/);
    assert.match(ops, /recognitionImage: null/);
    assert.match(ops, /unreferencedInventoryPhotoPaths/);
    assert.match(routes, /staging_thumbnail/);
  });

  it("uses one responsive unit tree and original-photo lightbox", () => {
    const listClient = read("src/components/InventoryListClient.tsx");
    assert.equal((listClient.match(/<ul className="inv-unit-list"/g) || []).length, 1);
    assert.match(listClient, /src: drawerDetail\.original_photo_url \|\| drawerDetail\.photo_url/);
  });
});
