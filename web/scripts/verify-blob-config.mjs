#!/usr/bin/env node
/**
 * Release check: public + private Blob tokens configured (never prints values).
 * Exit 0 when OK or when not running on Vercel (local dev may use filesystem).
 */
const isProdLike = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";

const publicBlobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
const privateIdProofBlobConfigured = Boolean(
  process.env.ID_PROOF_BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.ID_PROOF_READ_WRITE_TOKEN?.trim(),
);

const report = { publicBlobConfigured, privateIdProofBlobConfigured };

if (isProdLike) {
  if (!publicBlobConfigured || !privateIdProofBlobConfigured) {
    console.error("[verify-blob-config] missing required Blob tokens:", JSON.stringify(report));
    process.exit(1);
  }
  console.log("[verify-blob-config] OK", JSON.stringify(report));
  process.exit(0);
}

console.log("[verify-blob-config] skipped (not production-like)", JSON.stringify(report));
process.exit(0);
