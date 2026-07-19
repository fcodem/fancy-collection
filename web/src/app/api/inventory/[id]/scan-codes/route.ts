import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  isResponse,
  jsonError,
  jsonOk,
  requireJsonContentType,
  requireUser,
} from "@/lib/api";
import {
  assignScanCodeToInventory,
  deactivateScanCode,
  generateInternalDressCode,
  INVENTORY_SCAN_CODE_FORMATS,
  INVENTORY_SCAN_CODE_SOURCES,
  InventoryScanCodeError,
  setPrimaryScanCode,
  type InventoryScanCodeFormat,
  type InventoryScanCodeSource,
} from "@/lib/services/inventoryScanCode";

function inventoryIdFrom(raw: string): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function loadInventory(inventoryId: number) {
  return prisma.clothingItem.findUnique({
    where: { id: inventoryId },
    select: {
      id: true,
      sku: true,
      name: true,
      size: true,
      color: true,
      scanCodes: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    },
  });
}

function serviceError(error: unknown) {
  if (!(error instanceof InventoryScanCodeError)) return null;
  const status =
    error.code === "INVENTORY_NOT_FOUND" || error.code === "SCAN_CODE_NOT_FOUND"
      ? 404
      : error.code === "DUPLICATE_SCAN_CODE"
        ? 409
        : 400;
  return jsonError(error.message, status, { code: error.code, retryable: false });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const inventoryId = inventoryIdFrom((await context.params).id);
  if (!inventoryId) return jsonError("Invalid inventory item.", 400);
  const inventory = await loadInventory(inventoryId);
  if (!inventory) return jsonError("Inventory item not found.", 404);
  return jsonOk({ inventory });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const contentTypeError = requireJsonContentType(request);
  if (contentTypeError) return contentTypeError;

  const inventoryId = inventoryIdFrom((await context.params).id);
  if (!inventoryId) return jsonError("Invalid inventory item.", 400);

  const body = (await request.json().catch(() => null)) as
    | {
        action?: "assign" | "generate" | "deactivate" | "set_primary";
        code?: string;
        format?: string;
        source?: string;
        scanCodeId?: number;
        labelFormat?: "QR_CODE" | "CODE_128";
        confirmPrimary?: boolean;
      }
    | null;
  if (!body?.action) return jsonError("Action is required.", 400);

  try {
    const inventory = await loadInventory(inventoryId);
    if (!inventory) return jsonError("Inventory item not found.", 404);

    if (body.action === "assign") {
      if (typeof body.code !== "string") return jsonError("QR/barcode value is required.", 400);
      if (
        !INVENTORY_SCAN_CODE_FORMATS.includes(
          body.format as InventoryScanCodeFormat,
        )
      ) {
        return jsonError("Unsupported QR/barcode format.", 400);
      }
      if (
        !INVENTORY_SCAN_CODE_SOURCES.includes(
          body.source as InventoryScanCodeSource,
        )
      ) {
        return jsonError("Unsupported QR/barcode source.", 400);
      }
      const scanCode = await assignScanCodeToInventory(
        inventoryId,
        body.code,
        body.format as InventoryScanCodeFormat,
        body.source as InventoryScanCodeSource,
      );
      return jsonOk({ scanCode, inventory: await loadInventory(inventoryId) }, 201);
    }

    if (body.action === "generate") {
      const labelFormat = body.labelFormat === "CODE_128" ? "CODE_128" : "QR_CODE";
      const existing = inventory.scanCodes.find(
        (code) => code.active && code.source.startsWith("SYSTEM_GENERATED_"),
      );
      if (existing) {
        return jsonOk({
          scanCode: existing,
          reused: true,
          labelFormat,
          inventory,
        });
      }

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const scanCode = await assignScanCodeToInventory(
            inventoryId,
            generateInternalDressCode(),
            labelFormat,
            labelFormat === "QR_CODE"
              ? "SYSTEM_GENERATED_QR"
              : "SYSTEM_GENERATED_BARCODE",
          );
          return jsonOk(
            {
              scanCode,
              reused: false,
              labelFormat,
              inventory: await loadInventory(inventoryId),
            },
            201,
          );
        } catch (error) {
          if (
            error instanceof InventoryScanCodeError &&
            error.code === "DUPLICATE_SCAN_CODE" &&
            attempt < 5
          ) {
            continue;
          }
          throw error;
        }
      }
      return jsonError("Could not generate a unique dress code.", 503);
    }

    const scanCodeId = Number(body.scanCodeId);
    if (!Number.isSafeInteger(scanCodeId) || scanCodeId <= 0) {
      return jsonError("A valid scan-code mapping is required.", 400);
    }
    const mapping = inventory.scanCodes.find((code) => code.id === scanCodeId);
    if (!mapping) return jsonError("QR/barcode mapping not found for this item.", 404);

    if (body.action === "deactivate") {
      if (mapping.isPrimary && body.confirmPrimary !== true) {
        return jsonError(
          "Confirm before deactivating the primary QR/barcode.",
          409,
          { code: "PRIMARY_CONFIRMATION_REQUIRED", retryable: false },
        );
      }
      const scanCode = await deactivateScanCode(scanCodeId);
      return jsonOk({ scanCode, inventory: await loadInventory(inventoryId) });
    }

    if (body.action === "set_primary") {
      const scanCode = await setPrimaryScanCode(scanCodeId);
      return jsonOk({ scanCode, inventory: await loadInventory(inventoryId) });
    }

    return jsonError("Unsupported action.", 400);
  } catch (error) {
    const response = serviceError(error);
    if (response) return response;
    console.error("[inventory-scan-codes] mutation failed", error);
    return jsonError("Could not update QR/barcode mappings.", 500);
  }
}
