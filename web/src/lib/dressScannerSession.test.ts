import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closeScannerSession,
  createCameraSessionLock,
  tryAcceptCameraDecode,
} from "./dressScannerSession";

describe("dressScannerSession", () => {
  it("accepts only the first decode in a camera session", () => {
    const lock = createCameraSessionLock(7);
    assert.deepEqual(tryAcceptCameraDecode(lock, 7, "LRG-001"), {
      accepted: true,
      code: "LRG-001",
    });
    assert.equal(tryAcceptCameraDecode(lock, 7, "LRG-001").accepted, false);
    assert.equal(tryAcceptCameraDecode(lock, 7, "OTHER").accepted, false);
  });

  it("ignores callbacks from stale camera sessions", () => {
    const lock = createCameraSessionLock(2);
    assert.equal(tryAcceptCameraDecode(lock, 3, "ABC").accepted, false);
  });

  it("closeScannerSession stops tracks, disposes scanner, and clears container", async () => {
    const stopped: string[] = [];
    const container = { innerHTML: "<video></video>" };
    const originalGetElementById = globalThis.document?.getElementById;

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: (id: string) => (id === "dress-availability-camera" ? container : null),
      },
    });

    const session = {
      stopImmediately: () => stopped.push("immediate"),
      stopAfterDecode: async () => {
        stopped.push("after-decode");
      },
    };

    await closeScannerSession(session, "dress-availability-camera");
    assert.deepEqual(stopped, ["immediate", "after-decode"]);
    assert.equal(container.innerHTML, "");

    if (originalGetElementById) {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: { getElementById: originalGetElementById },
      });
    }
  });

  it("closeScannerSession is safe when session is null or already stopped", async () => {
    await assert.doesNotReject(async () => closeScannerSession(null));
    await assert.doesNotReject(async () =>
      closeScannerSession({
        stopImmediately: () => {
          throw new Error("already stopped");
        },
        stop: async () => {
          throw new Error("already stopped");
        },
      }),
    );
  });
});
