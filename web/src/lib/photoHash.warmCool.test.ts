import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { warmCoolHueMismatchPenalty, hueMassProfile } from "./photoHash";

describe("warmCoolHueMismatchPenalty", () => {
  it("penalises green catalog when query is warm multi-panel", () => {
    const warmQuery = new Array(36).fill(0);
    warmQuery[0] = 0.14;
    warmQuery[1] = 0.1;
    warmQuery[30] = 0.08;
    warmQuery[27] = 0.06;

    const greenStored = new Array(36).fill(0);
    greenStored[6] = 0.18;
    greenStored[7] = 0.12;
    greenStored[8] = 0.05;

    const penalty = warmCoolHueMismatchPenalty(warmQuery, greenStored);
    assert.ok(penalty >= 8, `expected penalty >= 8, got ${penalty}`);
  });

  it("no penalty when both warm panelled", () => {
    const warmA = new Array(36).fill(0);
    warmA[0] = 0.12;
    warmA[30] = 0.1;
    const warmB = new Array(36).fill(0);
    warmB[0] = 0.11;
    warmB[1] = 0.09;
    warmB[30] = 0.08;
    assert.equal(warmCoolHueMismatchPenalty(warmA, warmB), 0);
  });

  it("hueMassProfile separates warm vs green", () => {
    const green = new Array(36).fill(0);
    green[6] = 0.2;
    const warm = new Array(36).fill(0);
    warm[0] = 0.15;
    warm[30] = 0.1;
    const gp = hueMassProfile(green);
    const wp = hueMassProfile(warm);
    assert.ok(gp.green > gp.warm);
    assert.ok(wp.warm > wp.green);
  });
});
