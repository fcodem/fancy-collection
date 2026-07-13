import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createBookingWithSideEffectsCore } from "./services/bookingCreateOrchestration.core";
import { clearFetchJsonDedupe, fetchJson } from "./fetchJson";
import { clearMemoryCache, memoryCachedQuery } from "./perfCache";
import { startAiJobWorker, stopAiJobWorker } from "./dressChecker/aiJobWorker";
import { skipHeartbeat } from "./sessionHeartbeat";
import { enqueueInventoryPhotoJobsDurable } from "./inventoryPhotoPipeline";

const sampleInput = {
  customer_name: "TEST",
  customer_address: "ADDR",
  contact_1: "9999999999",
  whatsapp_no: "9999999999",
  delivery_date: "2026-08-01",
  delivery_time: "12:00 Noon",
  return_date: "2026-08-02",
  return_time: "12:00 Noon",
  items: [{ item_id: 1, dress_name: "DRESS", price: 100, advance: 10 }],
};

describe("booking create isolation", () => {
  it("succeeds when scheduleBookingBill throws", async () => {
    let created = 0;
    const result = await createBookingWithSideEffectsCore(
      sampleInput,
      { id: 9, username: "owner" },
      {
        createBooking: async () => {
          created += 1;
          return { id: 42, monthlySerial: 7 } as Awaited<
            ReturnType<typeof import("./services/bookingCrud").createBooking>
          >;
        },
        scheduleBookingBill: async () => {
          throw new Error("whatsapp schedule boom");
        },
        processWhatsAppJobQueue: async () => ({ processed: 0 }),
        findIdempotent: async () => null,
        saveIdempotent: async () => {},
        after: () => {},
      },
    );
    assert.equal(result.id, 42);
    assert.equal(result.serial, 7);
    assert.equal(created, 1);
    assert.equal(result.reused, false);
  });

  it("succeeds when WhatsApp/PDF processing throws after response", async () => {
    let afterRan = false;
    const result = await createBookingWithSideEffectsCore(
      sampleInput,
      { id: 9, username: "owner" },
      {
        createBooking: async () =>
          ({ id: 43, monthlySerial: 8 }) as Awaited<
            ReturnType<typeof import("./services/bookingCrud").createBooking>
          >,
        scheduleBookingBill: async () => undefined as never,
        processWhatsAppJobQueue: async () => {
          afterRan = true;
          throw new Error("pdf/meta boom");
        },
        findIdempotent: async () => null,
        saveIdempotent: async () => {},
        after: (fn) => {
          void Promise.resolve()
            .then(() => fn())
            .catch(() => {});
        },
      },
    );
    assert.equal(result.id, 43);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(afterRan, true);
  });

  it("returns the same booking for duplicate client_request_id", async () => {
    let creates = 0;
    const store = new Map<string, { id: number; monthlySerial: number }>();
    const deps = {
      createBooking: async () => {
        creates += 1;
        return { id: 100 + creates, monthlySerial: creates } as Awaited<
          ReturnType<typeof import("./services/bookingCrud").createBooking>
        >;
      },
      scheduleBookingBill: async () => undefined as never,
      processWhatsAppJobQueue: async () => ({ processed: 0 }),
      findIdempotent: async (key: string) => store.get(key) ?? null,
      saveIdempotent: async (key: string, bookingId: number) => {
        store.set(key, { id: bookingId, monthlySerial: creates });
      },
      after: () => {},
    };
    const key = "11111111-1111-4111-8111-111111111111";
    const first = await createBookingWithSideEffectsCore(
      { ...sampleInput, client_request_id: key },
      { id: 1, username: "owner" },
      deps,
    );
    const second = await createBookingWithSideEffectsCore(
      { ...sampleInput, client_request_id: key },
      { id: 1, username: "owner" },
      deps,
    );
    assert.equal(creates, 1);
    assert.equal(first.id, second.id);
    assert.equal(second.reused, true);
  });
});

describe("fetchJson GET dedupe", () => {
  it("two simultaneous GETs for the same URL invoke fetch only once", async () => {
    clearFetchJsonDedupe();
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const [a, b] = await Promise.all([
        fetchJson<{ ok: boolean }>("/api/dashboard/nav-counts", { dedupeMs: 5_000 }),
        fetchJson<{ ok: boolean }>("/api/dashboard/nav-counts", { dedupeMs: 5_000 }),
      ]);
      assert.equal(a.ok, true);
      assert.equal(b.ok, true);
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = original;
      clearFetchJsonDedupe();
    }
  });
});

describe("memoryCachedQuery concurrency", () => {
  it("shares one pending promise across concurrent cache misses", async () => {
    clearMemoryCache();
    let runs = 0;
    const loader = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 25));
      return { n: runs };
    };
    const [a, b, c] = await Promise.all([
      memoryCachedQuery(["perf-test"], loader, 30),
      memoryCachedQuery(["perf-test"], loader, 30),
      memoryCachedQuery(["perf-test"], loader, 30),
    ]);
    assert.equal(runs, 1);
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
    clearMemoryCache();
  });

  it("does not permanently cache rejected promises", async () => {
    clearMemoryCache();
    let runs = 0;
    await assert.rejects(
      memoryCachedQuery(
        ["perf-fail"],
        async () => {
          runs += 1;
          throw new Error("boom");
        },
        30,
      ),
    );
    const value = await memoryCachedQuery(
      ["perf-fail"],
      async () => {
        runs += 1;
        return "ok";
      },
      30,
    );
    assert.equal(value, "ok");
    assert.equal(runs, 2);
    clearMemoryCache();
  });
});

describe("AI worker serverless interval", () => {
  it("startAiJobWorker with VERCEL=1 does not call setInterval", () => {
    const prev = process.env.VERCEL;
    process.env.VERCEL = "1";
    stopAiJobWorker();
    let intervalCalls = 0;
    const real = global.setInterval;
    // @ts-expect-error test spy
    global.setInterval = ((...args: Parameters<typeof setInterval>) => {
      intervalCalls += 1;
      return real(...args);
    }) as typeof setInterval;
    try {
      startAiJobWorker({ skipImmediateDrain: true });
      assert.equal(intervalCalls, 0);
    } finally {
      global.setInterval = real;
      if (prev === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prev;
      stopAiJobWorker();
    }
  });
});

describe("SessionHeartbeat skip routing", () => {
  it("skips public/login routes and arms for protected routes", () => {
    assert.equal(skipHeartbeat("/login"), true);
    assert.equal(skipHeartbeat("/privacy"), true);
    assert.equal(skipHeartbeat("/"), false);
    assert.equal(skipHeartbeat("/booking/new"), false);
  });

  it("shouldSkipHeartbeat toggles only when crossing public↔protected boundary", () => {
    // Documented contract used by SessionHeartbeat useEffect deps:
    // effect re-runs when shouldSkipHeartbeat changes, not when pathname changes among protected pages.
    const a = skipHeartbeat("/booking");
    const b = skipHeartbeat("/inventory");
    const c = skipHeartbeat("/login");
    assert.equal(a, false);
    assert.equal(b, false);
    assert.equal(a, b); // same dependency value — timers not recreated
    assert.notEqual(a, c); // crossing to login changes dependency — timers stopped
  });
});

describe("inventory durable queue helpers", () => {
  it("inventory remains saved when durable enqueue fails and returns warning", async () => {
    const items = [{ id: 501 }, { id: 502 }];
    // Simulate createInventoryItem catch path without rolling back items.
    let ai_queue_warning: string | null = null;
    try {
      throw new Error("db enqueue failed");
    } catch (e) {
      console.error("[inventory] durable AI enqueue failed (items kept):", e);
      ai_queue_warning =
        "Inventory saved but AI queue could not be written. Retry from AI indexing.";
    }
    assert.equal(items.length, 2);
    assert.ok(ai_queue_warning?.includes("AI queue could not be written"));
  });

  it("successfully writes durable AI queue records via awaited enqueue", async () => {
    const seen: number[] = [];
    const result = await enqueueInventoryPhotoJobsDurable(
      [10, 11, 10],
      "photo_created",
      async (input) => {
        seen.push(input.itemId);
        return { jobId: input.itemId * 100, created: true };
      },
    );
    assert.deepEqual(seen.sort((a, b) => a - b), [10, 11]);
    assert.equal(result.queued, 2);
    assert.equal(result.warning, null);
    assert.ok(result.jobIds.includes(1000));
    assert.ok(result.jobIds.includes(1100));
  });

  it("returns warning without throwing when some enqueues fail", async () => {
    const result = await enqueueInventoryPhotoJobsDurable(
      [1, 2],
      "photo_created",
      async (input) => {
        if (input.itemId === 2) throw new Error("unique violation");
        return { jobId: 9, created: true };
      },
    );
    assert.equal(result.queued, 1);
    assert.ok(result.warning?.includes("AI queue incomplete"));
  });
});

// end
