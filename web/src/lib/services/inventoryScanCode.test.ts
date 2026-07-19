import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createInventoryScanCodeService,
  DUPLICATE_SCAN_CODE_MESSAGE,
  generateInternalDressCode,
  InventoryScanCodeError,
  normalizeScanCode,
} from "./inventoryScanCode";

type Item = { id: number; sku: string; name: string };
type Mapping = {
  id: number;
  inventoryId: number;
  code: string;
  normalizedCode: string;
  format: string;
  source: string;
  isPrimary: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function inMemoryDb(items: Item[]) {
  const inventory = new Map(items.map((item) => [item.id, item]));
  const mappings: Mapping[] = [];
  let nextId = 1;

  const scanCodeDelegate = {
    async findUnique(args: {
      where: { id?: number; normalizedCode?: string };
    }) {
      return (
        mappings.find((row) =>
          args.where.id != null
            ? row.id === args.where.id
            : row.normalizedCode === args.where.normalizedCode,
        ) ?? null
      );
    },
    async findFirst(args: {
      where: {
        normalizedCode?: string;
        inventoryId?: number;
        active?: boolean;
        id?: { not: number };
      };
      include?: { inventory: boolean };
      select?: { id: boolean };
    }) {
      const row =
        mappings.find(
          (candidate) =>
            (args.where.normalizedCode == null ||
              candidate.normalizedCode === args.where.normalizedCode) &&
            (args.where.inventoryId == null ||
              candidate.inventoryId === args.where.inventoryId) &&
            (args.where.active == null || candidate.active === args.where.active) &&
            (args.where.id?.not == null || candidate.id !== args.where.id.not),
        ) ?? null;
      if (!row) return null;
      if (args.include?.inventory) {
        return { ...row, inventory: inventory.get(row.inventoryId) ?? null };
      }
      if (args.select?.id) return { id: row.id };
      return row;
    },
    async create(args: {
      data: Omit<Mapping, "id" | "active" | "createdAt" | "updatedAt">;
    }) {
      const now = new Date();
      const row: Mapping = {
        id: nextId++,
        active: true,
        createdAt: now,
        updatedAt: now,
        ...args.data,
      };
      mappings.push(row);
      return row;
    },
    async update(args: {
      where: { id: number };
      data: Partial<Mapping>;
    }) {
      const row = mappings.find((candidate) => candidate.id === args.where.id);
      if (!row) throw new Error("mapping not found");
      Object.assign(row, args.data, { updatedAt: new Date() });
      return row;
    },
    async updateMany(args: {
      where: { inventoryId: number; isPrimary: boolean };
      data: Partial<Mapping>;
    }) {
      let count = 0;
      for (const row of mappings) {
        if (
          row.inventoryId === args.where.inventoryId &&
          row.isPrimary === args.where.isPrimary
        ) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
  };

  const db = {
    clothingItem: {
      async findUnique(args: { where: { id: number } }) {
        return inventory.get(args.where.id) ?? null;
      },
    },
    inventoryScanCode: scanCodeDelegate,
    async $transaction<T>(fn: (tx: typeof db) => Promise<T>) {
      return fn(db);
    },
  };

  return {
    db,
    mappings,
    deleteInventory(id: number) {
      inventory.delete(id);
      for (let i = mappings.length - 1; i >= 0; i -= 1) {
        if (mappings[i].inventoryId === id) mappings.splice(i, 1);
      }
    },
  };
}

function serviceFor(items: Item[]) {
  const memory = inMemoryDb(items);
  const service = createInventoryScanCodeService(
    memory.db as unknown as Parameters<typeof createInventoryScanCodeService>[0],
  );
  return { ...memory, service };
}

describe("inventory scan code normalization and generation", () => {
  it("preserves leading zeroes and removes scanner line endings", () => {
    assert.equal(normalizeScanCode("  001234567890\r\n"), "001234567890");
  });

  it("generates opaque, non-sequential internal dress codes", () => {
    const codes = new Set(Array.from({ length: 100 }, generateInternalDressCode));
    assert.equal(codes.size, 100);
    for (const code of codes) {
      assert.match(code, /^FC-D-[23456789A-HJ-NP-Z]{8}$/);
      assert.doesNotMatch(code, /^FC-D-\d+$/);
    }
  });
});

describe("inventory scan code service", () => {
  const items = [
    { id: 1, sku: "D-001", name: "Red Bridal Lehenga, Unit 1" },
    { id: 2, sku: "D-002", name: "Red Bridal Lehenga, Unit 2" },
  ];

  it("assigns and resolves an existing printed barcode", async () => {
    const { service } = serviceFor(items);
    await service.assignScanCodeToInventory(
      1,
      "8901234567890",
      "EAN_13",
      "EXISTING_PRINTED",
    );
    assert.equal((await service.findInventoryByScanCode("8901234567890"))?.id, 1);
  });

  it("assigns a generated QR code", async () => {
    const { service } = serviceFor(items);
    const code = generateInternalDressCode();
    const mapping = await service.assignScanCodeToInventory(
      1,
      code,
      "QR_CODE",
      "SYSTEM_GENERATED_QR",
    );
    assert.equal(mapping.code, code);
    assert.equal(mapping.isPrimary, true);
  });

  it("rejects a duplicate code assigned to another physical dress", async () => {
    const { service } = serviceFor(items);
    await service.assignScanCodeToInventory(1, "ABC-123", "CODE_128", "MANUAL");
    await assert.rejects(
      service.assignScanCodeToInventory(2, " abc-123\r\n", "CODE_128", "MANUAL"),
      (error) =>
        error instanceof InventoryScanCodeError &&
        error.code === "DUPLICATE_SCAN_CODE" &&
        error.message === DUPLICATE_SCAN_CODE_MESSAGE,
    );
  });

  it("allows multiple aliases for one dress and only one initial primary", async () => {
    const { service, mappings } = serviceFor(items);
    await service.assignScanCodeToInventory(1, "PRINTED-1", "CODE_39", "EXISTING_PRINTED");
    await service.assignScanCodeToInventory(
      1,
      "FC-D-7K4P9X2M",
      "QR_CODE",
      "SYSTEM_GENERATED_QR",
    );
    assert.equal(mappings.length, 2);
    assert.equal(mappings.filter((row) => row.isPrimary).length, 1);
  });

  it("does not resolve a deactivated code", async () => {
    const { service } = serviceFor(items);
    const mapping = await service.assignScanCodeToInventory(
      1,
      "DAMAGED-1",
      "CODE_128",
      "EXISTING_PRINTED",
    );
    await service.deactivateScanCode(mapping.id);
    assert.equal(await service.findInventoryByScanCode("DAMAGED-1"), null);
  });

  it("gives two physical units different codes even when they share a product", async () => {
    const { service } = serviceFor(items);
    const first = generateInternalDressCode();
    const second = generateInternalDressCode();
    await service.assignScanCodeToInventory(1, first, "QR_CODE", "SYSTEM_GENERATED_QR");
    await service.assignScanCodeToInventory(2, second, "QR_CODE", "SYSTEM_GENERATED_QR");
    assert.notEqual(first, second);
    assert.equal((await service.findInventoryByScanCode(first))?.id, 1);
    assert.equal((await service.findInventoryByScanCode(second))?.id, 2);
  });

  it("models cascade deletion of scan-code mappings", async () => {
    const { service, mappings, deleteInventory } = serviceFor(items);
    await service.assignScanCodeToInventory(1, "DELETE-ME", "QR_CODE", "MANUAL");
    deleteInventory(1);
    assert.equal(mappings.length, 0);

    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260719173000_inventory_scan_codes/migration.sql",
      ),
      "utf8",
    );
    assert.match(migration, /REFERENCES "clothing_items"\("id"\)[\s\S]*ON DELETE CASCADE/);
  });
});
