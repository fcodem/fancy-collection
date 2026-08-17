import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EMBEDDING_MODEL_ORDER,
  INVENTORY_EMBEDDING_DIM,
  parseEmbeddingModelOrder,
} from "./constants";

describe("imageEmbedding constants", () => {
  it("defaults to siglip then openai (768-d models only)", () => {
    assert.deepEqual(DEFAULT_EMBEDDING_MODEL_ORDER, ["siglip", "openai"]);
  });

  it("parses custom model order from env", () => {
    const prev = process.env.IMAGE_EMBEDDING_MODELS;
    process.env.IMAGE_EMBEDDING_MODELS = "siglip,openclip";
    assert.deepEqual(parseEmbeddingModelOrder(), ["siglip", "openclip"]);
    process.env.IMAGE_EMBEDDING_MODELS = "openai";
    assert.deepEqual(parseEmbeddingModelOrder(), ["openai"]);
    if (prev === undefined) delete process.env.IMAGE_EMBEDDING_MODELS;
    else process.env.IMAGE_EMBEDDING_MODELS = prev;
  });

  it("inventory embedding dimension is 768 for pgvector column", () => {
    assert.equal(INVENTORY_EMBEDDING_DIM, 768);
  });
});
