/**
 * Legacy dress scan-code backfill — same logic as backfill-inventory-scan-codes.
 * Preserves existing active codes; maps unique SKUs (e.g. LRG-001) as EXISTING_PRINTED QR.
 */
import prisma from "../src/lib/prisma";
import {
  assignScanCodeToInventory,
  generateInternalDressCode,
  InventoryScanCodeError,
  normalizeScanCode,
} from "../src/lib/services/inventoryScanCode";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = args.has("--dry-run");

async function main() {
  if (apply === dryRun) {
    console.error(
      "Choose exactly one mode: npm run backfill:dress-scan-codes -- --dry-run OR --apply",
    );
    process.exitCode = 2;
    return;
  }

  const items = await prisma.clothingItem.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      size: true,
      scanCodes: {
        where: { active: true },
        select: { format: true, normalizedCode: true, source: true },
      },
    },
  });

  const skuOwners = new Map<string, number[]>();
  for (const item of items) {
    const key = item.sku.trim().toUpperCase();
    if (!key) continue;
    const list = skuOwners.get(key) ?? [];
    list.push(item.id);
    skuOwners.set(key, list);
  }

  const assignedCodes = new Set(
    (
      await prisma.inventoryScanCode.findMany({
        where: { active: true },
        select: { normalizedCode: true },
      })
    ).map((row) => row.normalizedCode),
  );

  const stats = {
    inspected: items.length,
    qrPreserved: 0,
    barcodePreserved: 0,
    skuQrCreated: 0,
    qrGenerated: 0,
    barcodeGenerated: 0,
    conflicts: 0,
    failed: 0,
  };

  for (const item of items) {
    const activeQr = item.scanCodes.find((code) => code.format === "QR_CODE");
    const activeBarcode = item.scanCodes.find((code) => code.format === "CODE_128");
    if (activeQr) stats.qrPreserved += 1;
    if (activeBarcode) stats.barcodePreserved += 1;

    const normalizedSku = item.sku?.trim() ? normalizeScanCode(item.sku) : "";
    const skuUnique =
      normalizedSku &&
      (skuOwners.get(normalizedSku)?.length ?? 0) === 1 &&
      skuOwners.get(normalizedSku)?.[0] === item.id;
    const skuAvailable = skuUnique && !assignedCodes.has(normalizedSku);

    try {
      if (!activeQr) {
        if (skuAvailable) {
          console.log(`#${item.id} ${item.sku} — ${item.name}: QR EXISTING_PRINTED ${normalizedSku}`);
          stats.skuQrCreated += 1;
          if (apply) {
            await assignScanCodeToInventory(item.id, item.sku, "QR_CODE", "EXISTING_PRINTED");
            assignedCodes.add(normalizedSku);
          }
        } else {
          if (!skuUnique && normalizedSku) stats.conflicts += 1;
          const generated = generateInternalDressCode();
          console.log(`#${item.id} ${item.sku} — ${item.name}: generate QR ${generated}`);
          stats.qrGenerated += 1;
          if (apply) {
            await assignWithRetry(item.id, generated, "QR_CODE", "SYSTEM_GENERATED_QR");
            assignedCodes.add(normalizeScanCode(generated));
          }
        }
      }

      if (!activeBarcode) {
        let generated = generateInternalDressCode();
        while (assignedCodes.has(normalizeScanCode(generated))) {
          generated = generateInternalDressCode();
        }
        console.log(`#${item.id} ${item.sku} — ${item.name}: generate CODE_128 ${generated}`);
        stats.barcodeGenerated += 1;
        if (apply) {
          await assignWithRetry(item.id, generated, "CODE_128", "SYSTEM_GENERATED_BARCODE");
          assignedCodes.add(normalizeScanCode(generated));
        }
      }
    } catch (error) {
      stats.failed += 1;
      console.error(
        `#${item.id} ${item.sku} FAILED:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const lrg = items.find((row) => normalizeScanCode(row.sku) === "LRG-001");
  if (lrg) {
    console.log(
      `\nLRG-001 fixture: id=${lrg.id} name=${lrg.name} size=${lrg.size ?? "—"}`,
    );
  }

  console.log(`\n${dryRun ? "DRY RUN" : "APPLY"} summary:`, stats);
  if (dryRun) console.log("Dry run complete. No database writes were performed.");
}

async function assignWithRetry(
  inventoryId: number,
  code: string,
  format: "QR_CODE" | "CODE_128",
  source: "SYSTEM_GENERATED_QR" | "SYSTEM_GENERATED_BARCODE",
) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await assignScanCodeToInventory(inventoryId, code, format, source);
      return;
    } catch (error) {
      const collision =
        error instanceof InventoryScanCodeError && error.code === "DUPLICATE_SCAN_CODE";
      if (collision && attempt < 5) continue;
      throw error;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
