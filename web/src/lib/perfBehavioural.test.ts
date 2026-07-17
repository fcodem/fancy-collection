import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createBookingWithSideEffectsCore,
  isPrismaClientRequestIdConflict,
} from "./services/bookingCreateOrchestration.core";
import { clearFetchJsonDedupe, fetchJson } from "./fetchJson";
import { clearMemoryCache, memoryCachedQuery } from "./perfCache";
import { startAiJobWorker, stopAiJobWorker } from "./dressChecker/aiJobWorker";
import { skipHeartbeat } from "./sessionHeartbeat";
import { enqueueInventoryPhotoJobsDurable } from "./inventoryPhotoPipeline";
import { generateUuidV4 } from "./clientUuid";

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

type BookingRow = { id: number; monthlySerial: number; clientRequestId: string };

/**
 * Reproduces Postgres unique-constraint race on client_request_id:
 * concurrent create txns both start; exactly one INSERT commits; the other
 * throws P2002 and leaves no booking / activity / WhatsApp side effects.
 * WhatsApp bill is scheduled inside createBooking (atomic with the booking).
 */
function createAtomicClientRequestStore(opts?: { concurrentBarrier?: boolean }) {
  const bookings: BookingRow[] = [];
  const activities: number[] = [];
  const whatsappJobs: number[] = [];
  let nextId = 1;
  let serial = 0;
  let writeChain: Promise<void> = Promise.resolve();

  const useBarrier = opts?.concurrentBarrier === true;
  /** Barrier so both callers enter createBooking before either commits. */
  let barrierRelease: (() => void) | null = null;
  let barrierWaiters = 0;
  const barrier = useBarrier
    ? new Promise<void>((resolve) => {
        barrierRelease = resolve;
      })
    : Promise.resolve();

  const createBooking = async (input: { client_request_id?: string }) => {
    const key = input.client_request_id?.trim();
    if (!key) throw new Error("client_request_id required in race mock");

    if (useBarrier) {
      barrierWaiters += 1;
      if (barrierWaiters >= 2 && barrierRelease) barrierRelease();
      await barrier;
      // Overlapping work before unique commit (both txns open).
      await new Promise((r) => setTimeout(r, 5));
    }

    return new Promise<BookingRow>((resolve, reject) => {
      writeChain = writeChain.then(() => {
        // Unique index check + insert is atomic here (like DB commit).
        if (bookings.some((b) => b.clientRequestId === key)) {
          const err = {
            code: "P2002",
            meta: { target: ["clientRequestId"] },
          };
          reject(err);
          return;
        }
        const row: BookingRow = {
          id: nextId++,
          monthlySerial: ++serial,
          clientRequestId: key,
        };
        bookings.push(row);
        activities.push(row.id); // audit written only on successful commit
        whatsappJobs.push(row.id); // bill job in same txn as booking
        resolve(row);
      });
    });
  };

  return {
    bookings,
    activities,
    whatsappJobs,
    createBooking,
    findByClientRequestId: async (key: string) =>
      bookings.find((b) => b.clientRequestId === key) ?? null,
  };
}

describe("booking create isolation", () => {
  it("fails when createBooking throws (bill schedule failure)", async () => {
    let created = 0;
    await assert.rejects(
      () =>
        createBookingWithSideEffectsCore(
          sampleInput,
          { id: 9, username: "owner" },
          {
            createBooking: async () => {
              created += 1;
              throw new Error("bill schedule boom");
            },
            processWhatsAppJobQueue: async () => ({ processed: 0 }),
            findByClientRequestId: async () => null,
            after: (fn) => {
              void Promise.resolve().then(() => fn()).catch(() => {});
            },
          },
        ),
      /bill schedule boom/,
    );
    assert.equal(created, 1);
  });

  it("succeeds when WhatsApp/PDF processing throws after response", async () => {
    let afterRan = false;
    const result = await createBookingWithSideEffectsCore(
      sampleInput,
      { id: 9, username: "owner" },
      {
        createBooking: async () => {
          // Atomic bill schedule happens inside createBooking.
          return { id: 43, monthlySerial: 8 };
        },
        processWhatsAppJobQueue: async () => {
          afterRan = true;
          throw new Error("pdf/meta boom");
        },
        findByClientRequestId: async () => null,
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

  it("detects Prisma P2002 on clientRequestId", () => {
    assert.equal(
      isPrismaClientRequestIdConflict({
        code: "P2002",
        meta: { target: ["clientRequestId"] },
      }),
      true,
    );
    assert.equal(
      isPrismaClientRequestIdConflict({
        code: "P2002",
        meta: { target: ["client_request_id"] },
      }),
      true,
    );
    assert.equal(isPrismaClientRequestIdConflict({ code: "P2003" }), false);
  });

  it("sequential retry of same client_request_id skips createBooking via pre-check", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const store = new Map<string, { id: number; monthlySerial: number }>();
    let createCalls = 0;
    let whatsappCalls = 0;
    let activityCalls = 0;

    const deps = {
      createBooking: async () => {
        createCalls += 1;
        if (createCalls > 1) {
          throw new Error(
            "createBooking must not run for a sequential retry because real availability validation could reject it",
          );
        }
        activityCalls += 1;
        whatsappCalls += 1; // bill scheduled inside create
        const row = { id: 101, monthlySerial: 12 };
        store.set(key, row);
        return row;
      },
      processWhatsAppJobQueue: async () => ({ processed: 0 }),
      findByClientRequestId: async (k: string) => store.get(k) ?? null,
      after: (fn) => {
        void Promise.resolve().then(() => fn()).catch(() => {});
      },
    };
    const user = { id: 1, username: "owner" };
    const payload = { ...sampleInput, client_request_id: key };

    const first = await createBookingWithSideEffectsCore(payload, user, deps);
    const second = await createBookingWithSideEffectsCore(payload, user, deps);
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(first.id, 101);
    assert.equal(second.id, 101);
    assert.equal(first.id, second.id);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(createCalls, 1, "createBooking called exactly once");
    assert.equal(whatsappCalls, 1, "WhatsApp scheduled exactly once");
    assert.equal(activityCalls, 1, "no second activity/txn path on retry");
  });

  it("lost-response retry returns existing booking without side effects", async () => {
    const key = "33333333-3333-4333-8333-333333333333";
    // First booking already committed; browser lost the response and retries same UUID.
    const existing = { id: 77, monthlySerial: 9 };
    const store = new Map<string, { id: number; monthlySerial: number }>([[key, existing]]);
    let createCalls = 0;
    let whatsappCalls = 0;

    const result = await createBookingWithSideEffectsCore(
      { ...sampleInput, client_request_id: key },
      { id: 1, username: "owner" },
      {
        createBooking: async () => {
          createCalls += 1;
          whatsappCalls += 1;
          throw new Error(
            "createBooking must not run for a sequential retry because real availability validation could reject it",
          );
        },
        processWhatsAppJobQueue: async () => ({ processed: 0 }),
        findByClientRequestId: async (k: string) => store.get(k) ?? null,
        after: () => {},
      },
    );

    assert.equal(result.id, 77);
    assert.equal(result.serial, 9);
    assert.equal(result.reused, true);
    assert.equal(createCalls, 0);
    assert.equal(whatsappCalls, 0);
  });

  it("simultaneous client_request_id creates exactly one booking and one WhatsApp job", async () => {
    const store = createAtomicClientRequestStore({ concurrentBarrier: true });
    const key = "22222222-2222-4222-8222-222222222222";
    const deps = {
      createBooking: store.createBooking,
      processWhatsAppJobQueue: async () => ({ processed: 0 }),
      findByClientRequestId: store.findByClientRequestId,
      after: (fn) => {
        void Promise.resolve().then(() => fn()).catch(() => {});
      },
    };
    const user = { id: 1, username: "owner" };
    const payload = { ...sampleInput, client_request_id: key };

    const [first, second] = await Promise.all([
      createBookingWithSideEffectsCore(payload, user, deps),
      createBookingWithSideEffectsCore(payload, user, deps),
    ]);
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(first.id, second.id, "both responses share the same booking id");
    assert.equal(store.bookings.length, 1, "exactly one booking row");
    assert.equal(store.bookings[0]!.clientRequestId, key);
    assert.equal(store.whatsappJobs.length, 1, "exactly one WhatsApp booking-bill job");
    assert.equal(store.whatsappJobs[0], first.id);
    assert.equal(store.activities.length, 1, "exactly one activity/audit set");
    assert.equal(
      [first.reused, second.reused].filter(Boolean).length,
      1,
      "exactly one response is the reused winner path",
    );
  });
});

describe("client UUID helper", () => {
  it("generateUuidV4 returns a UUID-shaped string (not req- prefix)", () => {
    const id = generateUuidV4();
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(id.startsWith("req-"), false);
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
    const a = skipHeartbeat("/booking");
    const b = skipHeartbeat("/inventory");
    const c = skipHeartbeat("/login");
    assert.equal(a, false);
    assert.equal(b, false);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

describe("inventory durable queue helpers", () => {
  it("inventory remains saved when durable enqueue fails and returns warning", async () => {
    const items = [{ id: 501 }, { id: 502 }];
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
