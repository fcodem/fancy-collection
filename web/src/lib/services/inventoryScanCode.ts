import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";

export const INVENTORY_SCAN_CODE_FORMATS = [
  "QR_CODE",
  "CODE_128",
  "CODE_39",
  "EAN_13",
  "EAN_8",
  "UPC_A",
  "UPC_E",
  "UNKNOWN",
] as const;

export const INVENTORY_SCAN_CODE_SOURCES = [
  "EXISTING_PRINTED",
  "SYSTEM_GENERATED_QR",
  "SYSTEM_GENERATED_BARCODE",
  "MANUAL",
] as const;

export type InventoryScanCodeFormat = (typeof INVENTORY_SCAN_CODE_FORMATS)[number];
export type InventoryScanCodeSource = (typeof INVENTORY_SCAN_CODE_SOURCES)[number];

export const DUPLICATE_SCAN_CODE_MESSAGE =
  "This QR/barcode is already assigned to another inventory item.";

const MAX_CODE_LENGTH = 512;
const INTERNAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INTERNAL_CODE_LENGTH = 8;

type ScanCodeDb = Pick<
  PrismaClient,
  "clothingItem" | "inventoryScanCode" | "$transaction"
>;

export class InventoryScanCodeError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_SCAN_CODE"
      | "INVALID_FORMAT"
      | "INVALID_SOURCE"
      | "INVENTORY_NOT_FOUND"
      | "SCAN_CODE_NOT_FOUND"
      | "DUPLICATE_SCAN_CODE",
  ) {
    super(message);
    this.name = "InventoryScanCodeError";
  }
}

/**
 * Scanner-safe canonical form. Values always remain strings, preserving leading
 * zeroes and integer precision. NFKC + uppercase makes textual labels consistent.
 */
export function normalizeScanCode(rawCode: string): string {
  if (typeof rawCode !== "string") {
    throw new InventoryScanCodeError(
      "QR/barcode must be provided as text.",
      "INVALID_SCAN_CODE",
    );
  }

  const normalized = rawCode
    .replace(/[\r\n\u2028\u2029]+/g, "")
    .trim()
    .normalize("NFKC")
    .toUpperCase();

  if (!normalized) {
    throw new InventoryScanCodeError(
      "QR/barcode cannot be empty.",
      "INVALID_SCAN_CODE",
    );
  }
  if (normalized.length > MAX_CODE_LENGTH) {
    throw new InventoryScanCodeError(
      `QR/barcode cannot exceed ${MAX_CODE_LENGTH} characters.`,
      "INVALID_SCAN_CODE",
    );
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) {
    throw new InventoryScanCodeError(
      "QR/barcode contains unsupported control characters.",
      "INVALID_SCAN_CODE",
    );
  }
  return normalized;
}

/** Clean the display value without converting it to a number or changing its case. */
export function cleanScanCode(rawCode: string): string {
  normalizeScanCode(rawCode);
  return rawCode.replace(/[\r\n\u2028\u2029]+/g, "").trim().normalize("NFKC");
}

function assertFormat(format: string): asserts format is InventoryScanCodeFormat {
  if (!INVENTORY_SCAN_CODE_FORMATS.includes(format as InventoryScanCodeFormat)) {
    throw new InventoryScanCodeError(
      `Unsupported QR/barcode format: ${format}`,
      "INVALID_FORMAT",
    );
  }
}

function assertSource(source: string): asserts source is InventoryScanCodeSource {
  if (!INVENTORY_SCAN_CODE_SOURCES.includes(source as InventoryScanCodeSource)) {
    throw new InventoryScanCodeError(
      `Unsupported QR/barcode source: ${source}`,
      "INVALID_SOURCE",
    );
  }
}

/**
 * Cryptographically random, opaque inventory code. Rejection sampling avoids
 * modulo bias and no database ID is exposed.
 */
export function generateInternalDressCode(): string {
  let suffix = "";
  while (suffix.length < INTERNAL_CODE_LENGTH) {
    const bytes = randomBytes(INTERNAL_CODE_LENGTH);
    for (const byte of bytes) {
      const unbiasedLimit = 256 - (256 % INTERNAL_ALPHABET.length);
      if (byte >= unbiasedLimit) continue;
      suffix += INTERNAL_ALPHABET[byte % INTERNAL_ALPHABET.length];
      if (suffix.length === INTERNAL_CODE_LENGTH) break;
    }
  }
  return `FC-D-${suffix}`;
}

export function createInventoryScanCodeService(db: ScanCodeDb) {
  async function findInventoryByScanCode(rawCode: string) {
    const normalizedCode = normalizeScanCode(rawCode);
    const mapping = await db.inventoryScanCode.findFirst({
      where: { normalizedCode, active: true },
      include: { inventory: true },
    });
    return mapping?.inventory ?? null;
  }

  async function assignScanCodeToInventory(
    inventoryId: number,
    code: string,
    format: InventoryScanCodeFormat,
    source: InventoryScanCodeSource,
  ) {
    if (!Number.isSafeInteger(inventoryId) || inventoryId <= 0) {
      throw new InventoryScanCodeError(
        "A valid inventory item is required.",
        "INVENTORY_NOT_FOUND",
      );
    }
    assertFormat(format);
    assertSource(source);
    const normalizedCode = normalizeScanCode(code);
    const cleanedCode = cleanScanCode(code);

    try {
      return await db.$transaction(async (tx) => {
        const inventory = await tx.clothingItem.findUnique({
          where: { id: inventoryId },
          select: { id: true },
        });
        if (!inventory) {
          throw new InventoryScanCodeError(
            "Inventory item not found.",
            "INVENTORY_NOT_FOUND",
          );
        }

        const existing = await tx.inventoryScanCode.findUnique({
          where: { normalizedCode },
        });
        if (existing && existing.inventoryId !== inventoryId) {
          throw new InventoryScanCodeError(
            DUPLICATE_SCAN_CODE_MESSAGE,
            "DUPLICATE_SCAN_CODE",
          );
        }
        if (existing) {
          return tx.inventoryScanCode.update({
            where: { id: existing.id },
            data: { code: cleanedCode, format, source, active: true },
          });
        }

        const hasActiveCode = await tx.inventoryScanCode.findFirst({
          where: { inventoryId, active: true },
          select: { id: true },
        });
        return tx.inventoryScanCode.create({
          data: {
            inventoryId,
            code: cleanedCode,
            normalizedCode,
            format,
            source,
            isPrimary: !hasActiveCode,
          },
        });
      });
    } catch (error) {
      // The pre-check gives a friendly response normally; P2002 covers races.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new InventoryScanCodeError(
          DUPLICATE_SCAN_CODE_MESSAGE,
          "DUPLICATE_SCAN_CODE",
        );
      }
      throw error;
    }
  }

  async function deactivateScanCode(scanCodeId: number) {
    return db.$transaction(async (tx) => {
      const mapping = await tx.inventoryScanCode.findUnique({
        where: { id: scanCodeId },
      });
      if (!mapping) {
        throw new InventoryScanCodeError(
          "QR/barcode mapping not found.",
          "SCAN_CODE_NOT_FOUND",
        );
      }

      const deactivated = await tx.inventoryScanCode.update({
        where: { id: scanCodeId },
        data: { active: false, isPrimary: false },
      });
      if (mapping.isPrimary) {
        const replacement = await tx.inventoryScanCode.findFirst({
          where: {
            inventoryId: mapping.inventoryId,
            active: true,
            id: { not: mapping.id },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true },
        });
        if (replacement) {
          await tx.inventoryScanCode.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
        }
      }
      return deactivated;
    });
  }

  async function setPrimaryScanCode(scanCodeId: number) {
    return db.$transaction(async (tx) => {
      const mapping = await tx.inventoryScanCode.findUnique({
        where: { id: scanCodeId },
      });
      if (!mapping) {
        throw new InventoryScanCodeError(
          "QR/barcode mapping not found.",
          "SCAN_CODE_NOT_FOUND",
        );
      }
      await tx.inventoryScanCode.updateMany({
        where: { inventoryId: mapping.inventoryId, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.inventoryScanCode.update({
        where: { id: scanCodeId },
        data: { active: true, isPrimary: true },
      });
    });
  }

  return {
    findInventoryByScanCode,
    assignScanCodeToInventory,
    deactivateScanCode,
    setPrimaryScanCode,
  };
}

const service = createInventoryScanCodeService(prisma);

export const findInventoryByScanCode = service.findInventoryByScanCode;
export const assignScanCodeToInventory = service.assignScanCodeToInventory;
export const deactivateScanCode = service.deactivateScanCode;
export const setPrimaryScanCode = service.setPrimaryScanCode;
