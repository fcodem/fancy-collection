import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  cameraErrorMessage,
  normalizeDetectedBarcodeFormat,
} from "./cameraScanner";
import {
  buildInventoryLabelDocument,
  inventoryLabelDimensions,
} from "./inventoryScanLabel";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("shared camera scanner supports inventory barcodes", () => {
  it("normalizes camera formats used by Android, iOS fallback and desktop", () => {
    assert.equal(normalizeDetectedBarcodeFormat("qr_code"), "QR_CODE");
    assert.equal(normalizeDetectedBarcodeFormat("code_128"), "CODE_128");
    assert.equal(normalizeDetectedBarcodeFormat("EAN-13"), "EAN_13");
    assert.equal(normalizeDetectedBarcodeFormat("unknown-format"), "UNKNOWN");
  });

  it("provides an actionable permission-denied message", () => {
    const denied = new DOMException("denied", "NotAllowedError");
    assert.match(cameraErrorMessage(denied, true), /permission denied/i);
    assert.match(cameraErrorMessage(denied, true), /browser settings/i);
  });

  it("extends the existing scanner rather than adding another camera engine", () => {
    const component = read("src/components/InventoryScanCodeManager.tsx");
    assert.match(component, /new QrCameraSession/);
    assert.doesNotMatch(component, /getUserMedia\(/);
    const scanner = read("src/lib/cameraScanner.ts");
    for (const format of [
      "qr_code",
      "code_128",
      "code_39",
      "ean_13",
      "ean_8",
      "upc_a",
      "upc_e",
    ]) {
      assert.match(scanner, new RegExp(`"${format}"`));
    }
  });
});

describe("inventory QR/barcode management contracts", () => {
  const component = read("src/components/InventoryScanCodeManager.tsx");
  const route = read("src/app/api/inventory/[id]/scan-codes/route.ts");

  it("supports scan confirmation and manual keyboard-scanner assignment", () => {
    assert.match(component, /Scan Existing Code/);
    assert.match(component, /Confirm and Assign/);
    assert.match(component, /EXISTING_PRINTED/);
    assert.match(component, /Manual \/ USB scanner entry/);
    assert.match(component, /event\.key === "Enter"/);
    assert.match(component, /action: "assign"/);
  });

  it("generates QR and Code 128 labels from one reusable internal code", () => {
    assert.match(component, /Generate QR Code/);
    assert.match(component, /Generate Barcode/);
    assert.match(component, /JsBarcode\(svg, code\.code/);
    assert.match(component, /QRCode\.toDataURL\(code\.code/);
    assert.match(route, /source\.startsWith\("SYSTEM_GENERATED_"\)/);
    assert.match(route, /reused: true/);
  });

  it("authenticates every read and mutation authoritatively", () => {
    assert.match(route, /export async function GET[\s\S]*requireUser\(\)/);
    assert.match(route, /export async function POST[\s\S]*requireUser\(\)/);
    assert.match(route, /requireJsonContentType\(request\)/);
    assert.doesNotMatch(route, /requireFastReadUser|requireUserReadOnly/);
  });

  it("protects duplicate and primary-code deactivation", () => {
    assert.match(route, /DUPLICATE_SCAN_CODE/);
    assert.match(route, /PRIMARY_CONFIRMATION_REQUIRED/);
    assert.match(component, /This is the primary code/);
    assert.match(component, /confirmPrimary: code\.isPrimary/);
  });

  it("scopes every operation to the selected physical inventory route", () => {
    assert.match(component, /\/api\/inventory\/\$\{inventoryId\}\/scan-codes/);
    assert.match(route, /mapping = inventory\.scanCodes\.find/);
    assert.match(route, /mapping not found for this item/i);
  });

  it("exposes management on add, edit, detail and appropriate quick view", () => {
    assert.match(read("src/components/InventoryFormClient.tsx"), /InventoryScanCodeManager/);
    assert.match(read("src/app/inventory/[id]/page.tsx"), /InventoryScanCodeManager/);
    assert.match(read("src/components/InventoryListClient.tsx"), /QR \/ Barcode/);
    assert.match(component, /Save the inventory item first/);
  });

  it("uses responsive wrapping and a viewport-bounded scanner modal", () => {
    assert.match(component, /flexWrap: "wrap"/);
    assert.match(component, /width: "min\(520px, 100%\)"/);
    assert.match(component, /maxHeight: "95vh"/);
  });
});

describe("printable inventory labels", () => {
  it("renders compact thermal and standard dimensions", () => {
    assert.deepEqual(inventoryLabelDimensions("compact"), {
      widthMm: 50,
      heightMm: 30,
    });
    assert.deepEqual(inventoryLabelDimensions("standard"), {
      widthMm: 70,
      heightMm: 37,
    });
  });

  it("prints business, dress, SKU, optional details and human-readable code", () => {
    const html = buildInventoryLabelDocument({
      code: "FC-D-7K4P9X2M",
      itemName: "Red Bridal Lehenga",
      sku: "D-001",
      size: "M",
      color: "Red",
      symbolHtml: '<svg data-testid="barcode"></svg>',
      labelSize: "compact",
    });
    assert.match(html, /FANCY COLLECTION|Fancy Collection/);
    assert.match(html, /Red Bridal Lehenga/);
    assert.match(html, /D-001/);
    assert.match(html, /SIZE M/);
    assert.match(html, /FC-D-7K4P9X2M/);
    assert.match(html, /50mm 30mm/);
    assert.doesNotMatch(html, /customer|phone|booking/i);
  });

  it("escapes inventory text before placing it in printable HTML", () => {
    const html = buildInventoryLabelDocument({
      code: "SAFE",
      itemName: '<script>alert("x")</script>',
      symbolHtml: "<svg></svg>",
      labelSize: "standard",
    });
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });
});
