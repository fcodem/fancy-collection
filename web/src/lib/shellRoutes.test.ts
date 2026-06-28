import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isBareRoute } from "./shellRoutes";

describe("isBareRoute (shell layout regression)", () => {
  it("login and offline skip shell", () => {
    assert.equal(isBareRoute("/login"), true);
    assert.equal(isBareRoute("/login/pending"), true);
    assert.equal(isBareRoute("/~offline"), true);
  });

  it("print/slip routes skip shell", () => {
    assert.equal(isBareRoute("/booking/42/slip"), true);
    assert.equal(isBareRoute("/booking/42/delivery-slip"), true);
  });

  it("app routes use shell", () => {
    assert.equal(isBareRoute("/"), false);
    assert.equal(isBareRoute("/booking"), false);
    assert.equal(isBareRoute("/dashboard/stats/total-orders"), false);
  });
});
