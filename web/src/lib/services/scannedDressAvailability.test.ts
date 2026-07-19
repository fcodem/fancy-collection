import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createScannedDressAvailabilityService,
  parseBookingTimeToMinutes,
  parseKolkataDateTime,
  ScannedDressAvailabilityError,
} from "./scannedDressAvailability";

type Inventory = {
  id: number;
  name: string;
  sku: string;
  category: string;
  size: string | null;
  color: string | null;
  status: string;
  thumbnailPhoto: string | null;
  photo: string | null;
};

type BookingItemRow = {
  itemId: number | null;
  dressName: string;
  isCancelled: boolean;
  isReturned: boolean;
  isDelivered: boolean;
};

type BookingRow = {
  id: number;
  bookingNumber: string;
  monthlySerial: number;
  customerName: string;
  contact1: string | null;
  deliveryDate: Date;
  deliveryTime: string;
  returnDate: Date;
  returnTime: string;
  status: string;
  dressName: string | null;
  itemId: number | null;
  bookingItems: BookingItemRow[];
};

type ScanCodeRow = {
  inventoryId: number;
  normalizedCode: string;
  active: boolean;
};

function day(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

let nextBookingId = 1;

function booking(overrides: Partial<BookingRow> & {
  deliveryDate: string;
  returnDate: string;
}): BookingRow {
  const id = overrides.id ?? nextBookingId++;
  return {
    id,
    bookingNumber: overrides.bookingNumber ?? `BK-0726-${100 + id}`,
    monthlySerial: overrides.monthlySerial ?? id,
    customerName: overrides.customerName ?? "Test Customer",
    contact1: overrides.contact1 ?? "9812345678",
    deliveryTime: overrides.deliveryTime ?? "12:00 Noon",
    returnTime: overrides.returnTime ?? "11:00 AM",
    status: overrides.status ?? "booked",
    dressName: overrides.dressName ?? null,
    itemId: overrides.itemId ?? null,
    bookingItems: overrides.bookingItems ?? [],
    deliveryDate: day(overrides.deliveryDate),
    returnDate: day(overrides.returnDate),
  };
}

function activeItem(itemId: number, dressName = "Red Bridal Lehenga"): BookingItemRow {
  return { itemId, dressName, isCancelled: false, isReturned: false, isDelivered: false };
}

/**
 * In-memory stand-in for the two Prisma delegates the service touches.
 * It interprets exactly the query shapes the service is allowed to issue,
 * so an unexpected/heavier query fails the test rather than passing silently.
 */
function fakeDb(opts: {
  inventory: Inventory[];
  scanCodes: ScanCodeRow[];
  bookings: BookingRow[];
}) {
  const inventoryById = new Map(opts.inventory.map((row) => [row.id, row]));
  const queryLog: string[] = [];

  const db = {
    inventoryScanCode: {
      async findFirst(args: {
        where: { normalizedCode: string; active: boolean };
        select: { inventory: { select: Record<string, boolean> } };
      }) {
        queryLog.push("scanCode.findFirst");
        const mapping = opts.scanCodes.find(
          (row) =>
            row.normalizedCode === args.where.normalizedCode &&
            row.active === args.where.active,
        );
        if (!mapping) return null;
        const inventory = inventoryById.get(mapping.inventoryId) ?? null;
        return { inventory };
      },
    },
    booking: {
      async findMany(args: {
        where: {
          deliveryDate: { lt: Date };
          returnDate: { gte: Date };
          status: { in: string[] };
          id?: { not: number };
          OR: Array<Record<string, unknown>>;
        };
        take: number;
      }) {
        queryLog.push("booking.findMany");
        assert.ok(args.take <= 50, "conflict query must stay bounded");
        const itemBranch = args.where.OR[0] as {
          bookingItems: {
            some: { itemId: number; isCancelled: boolean; isReturned: boolean };
          };
        };
        const itemId = itemBranch.bookingItems.some.itemId;
        return opts.bookings
          .filter((b) => args.where.status.in.includes(b.status))
          .filter((b) => args.where.id?.not == null || b.id !== args.where.id.not)
          .filter(
            (b) =>
              b.deliveryDate.getTime() < args.where.deliveryDate.lt.getTime() &&
              b.returnDate.getTime() >= args.where.returnDate.gte.getTime(),
          )
          .filter((b) => {
            const occupiesViaItems = b.bookingItems.some(
              (row) => row.itemId === itemId && !row.isCancelled && !row.isReturned,
            );
            const occupiesLegacy = b.itemId === itemId && b.bookingItems.length === 0;
            return occupiesViaItems || occupiesLegacy;
          })
          .map((b) => ({
            ...b,
            bookingItems: b.bookingItems.filter((row) => row.itemId === itemId),
          }));
      },
    },
  };

  return { db, queryLog };
}

const DRESS: Inventory = {
  id: 42,
  name: "Red Bridal Lehenga",
  sku: "BR-001",
  category: "Lehenga",
  size: "40",
  color: "Red",
  status: "available",
  thumbnailPhoto: "/thumbs/br-001.webp",
  photo: "/photos/br-001.jpg",
};

function serviceWith(bookings: BookingRow[], overrides?: {
  inventory?: Partial<Inventory>;
  scanCodes?: ScanCodeRow[];
}) {
  const inventory = { ...DRESS, ...overrides?.inventory };
  const scanCodes = overrides?.scanCodes ?? [
    { inventoryId: inventory.id, normalizedCode: "FC-D-7K4P9X2M", active: true },
  ];
  const { db, queryLog } = fakeDb({ inventory: [inventory], scanCodes, bookings });
  return {
    service: createScannedDressAvailabilityService(db as never),
    queryLog,
  };
}

const REQUEST = {
  rawCode: "fc-d-7k4p9x2m",
  deliveryDateTime: "2026-07-28T16:00:00+05:30",
  returnDateTime: "2026-07-30T11:00:00+05:30",
};

describe("Asia/Kolkata date-time parsing", () => {
  it("interprets offset-less values as Kolkata wall time", () => {
    const parsed = parseKolkataDateTime("2026-07-28T16:00", "delivery");
    assert.equal(parsed.date, "2026-07-28");
    assert.equal(parsed.minutes, 16 * 60);
  });

  it("keeps the Kolkata calendar date at the midnight boundary", () => {
    // 00:15 IST on 28 July is still 27 July in UTC.
    const parsed = parseKolkataDateTime("2026-07-28T00:15:00+05:30", "delivery");
    assert.equal(parsed.date, "2026-07-28");
    assert.equal(parsed.minutes, 15);
    const utcEvening = parseKolkataDateTime("2026-07-27T18:45:00Z", "delivery");
    assert.equal(utcEvening.date, "2026-07-28");
    assert.equal(utcEvening.minutes, 15);
  });

  it("snaps date-only inputs to the boundary of the day", () => {
    assert.equal(parseKolkataDateTime("2026-07-28", "delivery").minutes, 0);
    assert.equal(
      parseKolkataDateTime("2026-07-28", "return").minutes,
      23 * 60 + 59,
    );
  });

  it("rejects invalid or missing dates", () => {
    for (const bad of ["", "  ", undefined, null]) {
      assert.throws(
        () => parseKolkataDateTime(bad, "delivery"),
        (error: unknown) =>
          error instanceof ScannedDressAvailabilityError && error.code === "MISSING_DATE",
      );
    }
    for (const bad of ["not-a-date", "2026-13-45", "2026-07-28T99:00"]) {
      assert.throws(
        () => parseKolkataDateTime(bad, "delivery"),
        (error: unknown) =>
          error instanceof ScannedDressAvailabilityError && error.code === "INVALID_DATE",
      );
    }
  });
});

describe("booking free-text time parsing", () => {
  it("parses the booking form's time vocabulary", () => {
    assert.equal(parseBookingTimeToMinutes("8:00 AM"), 480);
    assert.equal(parseBookingTimeToMinutes("12:00 Noon"), 720);
    assert.equal(parseBookingTimeToMinutes("4:30 PM"), 990);
    assert.equal(parseBookingTimeToMinutes("12:15 AM"), 15);
  });

  it("returns null for unparseable values instead of guessing", () => {
    assert.equal(parseBookingTimeToMinutes(""), null);
    assert.equal(parseBookingTimeToMinutes("sometime"), null);
    assert.equal(parseBookingTimeToMinutes(null), null);
  });
});

describe("checkScannedDressAvailability", () => {
  it("returns AVAILABLE with lean dress details for a free dress", async () => {
    const { service, queryLog } = serviceWith([
      booking({
        deliveryDate: "2026-07-20",
        returnDate: "2026-07-22",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "AVAILABLE");
    assert.deepEqual(result.dress, {
      id: 42,
      name: "Red Bridal Lehenga",
      sku: "BR-001",
      category: "Lehenga",
      size: "40",
      color: "Red",
      status: "available",
      thumbnailUrl: "/thumbs/br-001.webp",
    });
    assert.deepEqual(result.blockingRecords, []);
    assert.deepEqual(result.warningRecords, []);
    assert.deepEqual(queryLog, ["scanCode.findFirst", "booking.findMany"]);
  });

  it("returns BOOKED for a genuine overlap with lean record details", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-27",
        returnDate: "2026-07-29",
        customerName: "Priya",
        contact1: "9800000001",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "BOOKED");
    assert.equal(result.blockingRecords.length, 1);
    const record = result.blockingRecords[0];
    assert.equal(record.customerName, "Priya");
    assert.equal(record.contact, "9800000001");
    assert.equal(record.dressName, "Red Bridal Lehenga");
    assert.equal(record.deliveryDate, "2026-07-27");
    assert.equal(record.returnDate, "2026-07-29");
    assert.equal(record.bookingStatus, "booked");
    assert.equal(record.itemStatus, "booked");
    assert.equal(record.reason, "OVERLAPPING_BOOKING");
    assert.match(record.bookingNumber, /^BK-/);
    // Never expose documents/photos/financials on availability records.
    assert.ok(!("idPhoto1" in record));
    assert.ok(!("totalPrice" in record));
  });

  it("warns when an existing booking returns on the requested delivery day", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-26",
        returnDate: "2026-07-28",
        returnTime: "11:00 AM",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "WARNING_RETURNING_ON_DELIVERY_DAY");
    assert.equal(result.blockingRecords.length, 0);
    assert.equal(result.warningRecords.length, 1);
    assert.equal(result.warningRecords[0].reason, "RETURNING_ON_DELIVERY_DAY");
  });

  it("warns when the next booking starts on the requested return day", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-30",
        returnDate: "2026-08-02",
        deliveryTime: "5:00 PM",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "WARNING_BOOKED_ON_RETURN_DAY");
    assert.equal(result.warningRecords.length, 1);
    assert.equal(result.warningRecords[0].reason, "BOOKED_ON_RETURN_DAY");
  });

  it("returns WARNING_BOTH_BOUNDARIES when both boundary handovers occur", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-26",
        returnDate: "2026-07-28",
        returnTime: "11:00 AM",
        bookingItems: [activeItem(DRESS.id)],
      }),
      booking({
        deliveryDate: "2026-07-30",
        returnDate: "2026-08-02",
        deliveryTime: "5:00 PM",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "WARNING_BOTH_BOUNDARIES");
    assert.equal(result.warningRecords.length, 2);
  });

  it("hard blocks a same-day handover with a genuine time overlap", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-26",
        returnDate: "2026-07-28",
        // Returns at 6 PM but requested delivery is 4 PM the same day.
        returnTime: "6:00 PM",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "BOOKED");
    assert.equal(result.blockingRecords[0].reason, "OVERLAPPING_BOOKING");
  });

  it("blocks when the next booking on the return day starts before the return time", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-30",
        returnDate: "2026-08-02",
        // Requested return is 11 AM but the next customer picks up at 9 AM.
        deliveryTime: "9:00 AM",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "BOOKED");
  });

  it("ignores cancelled bookings and cancelled booking items", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-27",
        returnDate: "2026-07-29",
        status: "cancelled",
        bookingItems: [activeItem(DRESS.id)],
      }),
      booking({
        deliveryDate: "2026-07-27",
        returnDate: "2026-07-29",
        bookingItems: [
          { ...activeItem(DRESS.id), isCancelled: true },
          activeItem(999, "Some Other Dress"),
        ],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "AVAILABLE");
  });

  it("ignores returned booking items (partial return preserved)", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-27",
        returnDate: "2026-07-29",
        status: "delivered",
        bookingItems: [
          { ...activeItem(DRESS.id), isReturned: true },
          // Another dress still out does not block this dress.
          { ...activeItem(999, "Other Dress"), isDelivered: true },
        ],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "AVAILABLE");
  });

  it("still blocks on legacy single-item bookings without item rows", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-27",
        returnDate: "2026-07-29",
        itemId: DRESS.id,
        dressName: "Red Bridal Lehenga",
        bookingItems: [],
      }),
    ]);
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "BOOKED");
    assert.equal(result.blockingRecords[0].dressName, "Red Bridal Lehenga");
  });

  it("returns MAINTENANCE without running the booking query", async () => {
    for (const status of ["maintenance", "repair", "cleaning"]) {
      const { service, queryLog } = serviceWith([], { inventory: { status } });
      const result = await service.checkScannedDressAvailability(REQUEST);
      assert.equal(result.status, "MAINTENANCE");
      assert.equal(result.dress?.status, status);
      assert.deepEqual(queryLog, ["scanCode.findFirst"]);
    }
  });

  it("returns INACTIVE for retired inventory", async () => {
    const { service } = serviceWith([], { inventory: { status: "retired" } });
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "INACTIVE");
  });

  it("returns CODE_NOT_FOUND for an unknown code", async () => {
    const { service, queryLog } = serviceWith([]);
    const result = await service.checkScannedDressAvailability({
      ...REQUEST,
      rawCode: "FC-D-DOESNOTEX",
    });
    assert.equal(result.status, "CODE_NOT_FOUND");
    assert.equal(result.dress, null);
    assert.deepEqual(queryLog, ["scanCode.findFirst"]);
  });

  it("returns CODE_NOT_FOUND for a deactivated code", async () => {
    const { service } = serviceWith([], {
      scanCodes: [
        { inventoryId: DRESS.id, normalizedCode: "FC-D-7K4P9X2M", active: false },
      ],
    });
    const result = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(result.status, "CODE_NOT_FOUND");
  });

  it("resolves every alias code of the same dress to the same answer", async () => {
    const bookings = [
      booking({
        deliveryDate: "2026-07-27",
        returnDate: "2026-07-29",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ];
    const aliases = [
      { inventoryId: DRESS.id, normalizedCode: "FC-D-7K4P9X2M", active: true },
      { inventoryId: DRESS.id, normalizedCode: "0012345678", active: true },
    ];
    for (const rawCode of ["FC-D-7K4P9X2M", "0012345678", "  0012345678\n"]) {
      const { service } = serviceWith(bookings, { scanCodes: aliases });
      const result = await service.checkScannedDressAvailability({ ...REQUEST, rawCode });
      assert.equal(result.status, "BOOKED");
      assert.equal(result.dress?.id, DRESS.id);
    }
  });

  it("classifies boundaries by Kolkata calendar date at midnight edges", async () => {
    const { service } = serviceWith([
      booking({
        deliveryDate: "2026-07-26",
        returnDate: "2026-07-28",
        returnTime: "11:00 AM",
        bookingItems: [activeItem(DRESS.id)],
      }),
    ]);
    // 18:45 UTC on 27 July is 00:15 IST on 28 July: same-day handover, but the
    // existing 11 AM return is after 00:15, so this is a genuine overlap.
    const midnight = await service.checkScannedDressAvailability({
      ...REQUEST,
      deliveryDateTime: "2026-07-27T18:45:00Z",
      returnDateTime: "2026-07-30T11:00:00+05:30",
    });
    assert.equal(midnight.status, "BOOKED");

    // Same instant expressed in IST wall time behaves identically.
    const wallClock = await service.checkScannedDressAvailability({
      ...REQUEST,
      deliveryDateTime: "2026-07-28T00:15:00+05:30",
      returnDateTime: "2026-07-30T11:00:00+05:30",
    });
    assert.equal(wallClock.status, "BOOKED");
  });

  it("excludes the booking being edited", async () => {
    const current = booking({
      id: 900,
      deliveryDate: "2026-07-28",
      returnDate: "2026-07-30",
      bookingItems: [activeItem(DRESS.id)],
    });
    const { service } = serviceWith([current]);

    const withoutExclusion = await service.checkScannedDressAvailability(REQUEST);
    assert.equal(withoutExclusion.status, "BOOKED");

    const excluded = await service.checkScannedDressAvailability({
      ...REQUEST,
      excludeBookingId: 900,
    });
    assert.equal(excluded.status, "AVAILABLE");
  });

  it("validates code, dates, range and excludeBookingId", async () => {
    const { service } = serviceWith([]);
    const expectCode = async (
      input: Parameters<typeof service.checkScannedDressAvailability>[0],
      code: string,
    ) => {
      await assert.rejects(
        () => service.checkScannedDressAvailability(input),
        (error: unknown) =>
          error instanceof ScannedDressAvailabilityError && error.code === code,
      );
    };

    await expectCode({ ...REQUEST, rawCode: "   " }, "MISSING_CODE");
    await expectCode({ ...REQUEST, rawCode: "a".repeat(600) }, "INVALID_CODE");
    await expectCode({ ...REQUEST, deliveryDateTime: "" }, "MISSING_DATE");
    await expectCode({ ...REQUEST, returnDateTime: "" }, "MISSING_DATE");
    await expectCode({ ...REQUEST, returnDateTime: "garbage" }, "INVALID_DATE");
    await expectCode(
      {
        ...REQUEST,
        deliveryDateTime: "2026-07-30T11:00:00+05:30",
        returnDateTime: "2026-07-28T16:00:00+05:30",
      },
      "INVALID_DATE_RANGE",
    );
    await expectCode(
      { ...REQUEST, returnDateTime: REQUEST.deliveryDateTime },
      "INVALID_DATE_RANGE",
    );
    await expectCode({ ...REQUEST, excludeBookingId: -4 }, "INVALID_BOOKING_ID");
    await expectCode({ ...REQUEST, excludeBookingId: 1.5 }, "INVALID_BOOKING_ID");
  });
});
