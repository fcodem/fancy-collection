#!/usr/bin/env node
/**
 * Private media lifecycle release gate — static/code checks + critical unit tests.
 * Never prints token values.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

const publicBlobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
const privateIdProofBlobConfigured = Boolean(
  process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.ID_PROOF_READ_WRITE_TOKEN?.trim(),
);

const tokenReport = { publicBlobConfigured, privateIdProofBlobConfigured };
console.log("[verify-private-media-release] tokens", JSON.stringify(tokenReport));

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  console.error("[verify-private-media-release] FAIL:", msg);
  process.exit(1);
}

function assertNoMatch(label, source, pattern) {
  if (pattern.test(source)) {
    fail(`${label} matched forbidden pattern ${pattern}`);
  }
}

function assertMatch(label, source, pattern) {
  if (!pattern.test(source)) {
    fail(`${label} missing required pattern ${pattern}`);
  }
}

// --- .env.example ---
const envExample = read(".env.example");
assertMatch(".env.example BLOB_READ_WRITE_TOKEN", envExample, /^BLOB_READ_WRITE_TOKEN=/m);
assertMatch(".env.example ID_PROOF_BLOB_READ_WRITE_TOKEN", envExample, /^ID_PROOF_BLOB_READ_WRITE_TOKEN=/m);
assertMatch(".env.example ID_PROOF_READ_WRITE_TOKEN alias doc", envExample, /ID_PROOF_READ_WRITE_TOKEN/);

// --- Private booking uploads must not use public token ---
const privateMedia = read("src/lib/storage/privateBookingMedia.ts");
assertNoMatch("privateBookingMedia public token", privateMedia, /process\.env\.BLOB_READ_WRITE_TOKEN/);
assertMatch("privateBookingMedia private token", privateMedia, /ID_PROOF_BLOB_READ_WRITE_TOKEN/);
assertMatch("privateBookingMedia access private", privateMedia, /access: "private"/);

const upload = read("src/lib/upload.ts");
const savePrivateStart = upload.indexOf("export async function savePrivateBookingUpload");
const savePrivateEnd = upload.indexOf("export async function deleteUpload");
const savePrivateBlock = upload.slice(savePrivateStart, savePrivateEnd);
assertNoMatch("savePrivateBookingUpload public token", savePrivateBlock, /BLOB_READ_WRITE_TOKEN/);
assertMatch("savePrivateBookingUpload uses private media", savePrivateBlock, /savePrivateBookingMedia/);

for (const route of [
  "src/app/api/uploads/order-photo/route.ts",
  "src/app/api/return/[id]/save/route.ts",
]) {
  const src = read(route);
  assertMatch(`${route} private upload`, src, /savePrivateBookingUpload/);
  assertNoMatch(`${route} public saveUpload`, src, /\bsaveUpload\b/);
}

// --- Inventory uploads must not use private token ---
const publicMedia = read("src/lib/storage/publicInventoryMedia.ts");
assertMatch("publicInventoryMedia public token", publicMedia, /BLOB_READ_WRITE_TOKEN/);
assertNoMatch(
  "publicInventoryMedia private token",
  publicMedia,
  /ID_PROOF_BLOB_READ_WRITE_TOKEN|ID_PROOF_READ_WRITE_TOKEN/,
);
assertMatch("publicInventoryMedia access public", publicMedia, /access: "public"/);

// --- Private-media route must not expose raw stored blob URLs in JSON responses ---
const serve = read("src/lib/storage/privateMediaServe.ts");
assertMatch("servePrivateMedia auth", serve, /getCurrentUser/);
assertMatch("servePrivateMedia no-store", serve, /private, no-store/);
assertNoMatch("servePrivateMedia pass-through jsonOk url param", serve, /jsonOk\(\{\s*url:\s*url/);
assertNoMatch("servePrivateMedia redirect to blob", serve, /NextResponse\.redirect/);

// --- Cleanup must refuse permanent inventory without explicit replacement flag ---
const cleanup = read("src/lib/bookingPrivateMediaCleanup.ts");
assertMatch("private cleanup inventory guard", cleanup, /isPermanentInventoryMedia/);
assertMatch("private cleanup REFUSED constant", cleanup, /REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA/);

const blobCleanup = read("src/lib/blobCleanup.ts");
assertMatch("blob cleanup inventory guard", blobCleanup, /isPermanentInventoryMedia/);
assertMatch("blob cleanup REFUSED constant", blobCleanup, /REFUSED_TO_DELETE_PERMANENT_INVENTORY_MEDIA/);

assertMatch("deleteUpload inventory guard", upload, /allowInventoryReplacement/);
assertMatch("deleteUpload refuses permanent inventory", upload, /isPermanentInventoryMedia\(stored\) && !opts\?\.allowInventoryReplacement/);

// --- Critical unit tests ---
const criticalTests = [
  "src/lib/storage/mediaClassification.test.ts",
  "src/lib/bookingPrivateMediaCleanup.test.ts",
  "src/lib/idProofUpload.test.ts",
  "src/lib/storage/privateMediaRelease.test.ts",
];

console.log("[verify-private-media-release] running critical unit tests...");
const result = spawnSync("npx", ["tsx", "--test", ...criticalTests], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("[verify-private-media-release] OK", JSON.stringify(tokenReport));
