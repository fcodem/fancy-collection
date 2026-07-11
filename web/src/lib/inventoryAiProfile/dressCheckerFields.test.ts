import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseColorHistogram,
  resolveProcessingError,
  resolveEmbeddingSource,
  toDressCheckerFields,
} from "./dressCheckerFields";

describe("dressCheckerFields", () => {
  it("prefers processingError over legacy error", () => {
    assert.equal(resolveProcessingError({ processingError: "new", error: "old" }), "new");
    assert.equal(resolveProcessingError({ error: "legacy only" }), "legacy only");
    assert.equal(resolveProcessingError({}), null);
  });

  it("parses color histogram arrays", () => {
    assert.deepEqual(parseColorHistogram([0.1, 0.2]), [0.1, 0.2]);
    assert.equal(parseColorHistogram(["bad"]), null);
    assert.equal(parseColorHistogram(null), null);
  });

  it("resolves embedding source with json fallback", () => {
    assert.equal(resolveEmbeddingSource(true, null), "pgvector");
    assert.equal(resolveEmbeddingSource(false, [1, 2, 3]), "json_fallback");
    assert.equal(resolveEmbeddingSource(false, null), "none");
  });

  it("maps profile row to dress checker fields", () => {
    const fields = toDressCheckerFields(
      {
        photoHash: "abc",
        differenceHash: "def",
        colorHistogram: [0.5],
        processingError: null,
        error: "warn",
        reindexedAt: new Date("2026-07-10T00:00:00.000Z"),
        imageEmbeddingJson: [0.1],
      },
      false,
    );
    assert.equal(fields.photoHash, "abc");
    assert.equal(fields.processingError, "warn");
    assert.equal(fields.embeddingSource, "json_fallback");
    assert.equal(fields.hasEmbedding, true);
  });
});
