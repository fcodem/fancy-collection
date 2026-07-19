import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formDataToFile } from "./formDataFile";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("formDataToFile", () => {
  it("accepts Blob uploads from mobile browsers", () => {
    const blob = new Blob(["fake-image"], { type: "image/jpeg" });
    const file = formDataToFile(blob, "id_photo_1.jpg");
    assert.ok(file);
    assert.equal(file!.name, "id_photo_1.jpg");
    assert.equal(file!.type, "image/jpeg");
    assert.ok(file!.size > 0);
  });

  it("rejects empty blobs and string form fields", () => {
    assert.equal(formDataToFile(new Blob([]), "id_photo_1.jpg"), null);
    assert.equal(formDataToFile("not-a-file", "id_photo_1.jpg"), null);
  });
});

describe("ID proof upload contracts", () => {
  const upload = read("src/lib/upload.ts");
  const delivery = read("src/components/DeliveryDetailClient.tsx");

  it("stores ID proofs privately and skips sharp on Vercel", () => {
    assert.match(upload, /process\.env\.VERCEL/);
    assert.match(upload, /access: "private"/);
    assert.match(upload, /id-proofs/);
    assert.doesNotMatch(
      upload.slice(upload.indexOf("export async function saveIdProofUpload")),
      /saveCompressedFromBuffer\(raw, "id-proofs".*VERCEL/s,
    );
  });

  it("does not block delivery when optional ID photo upload fails", () => {
    assert.match(delivery, /Customer ID Photos[\s\S]*\(optional\)/);
    assert.match(delivery, /never block deliver/i);
    assert.doesNotMatch(delivery, /Could not save ID photos\. Try Save ID Photos/);
  });
});
