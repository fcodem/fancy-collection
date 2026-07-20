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

try {
  if (apply === dryRun) {
    console.error(
      "Choose exactly one mode: npm run backfill:inventory-scan-codes -- --dry-run OR --apply",
    );
    process.exitCode = 2;
  } else {
    await run();
  }
} finally {
  await prisma.$disconnect();
}

type ReportLine = {
  inventoryId: number;
  sku: string;
  name: string;
  action: string;
};

async function run() {
  const items = await prisma.clothingItem.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      scanCodes: {
        where: { active: true },
        select: { id: true, format: true, normalizedCode: true, source: true },
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

  const report: ReportLine[] = [];

  for (const item of items) {
    const activeQr = item.scanCodes.find((code) => code.format === "QR_CODE");
    const activeBarcode = item.scanCodes.find((code) => code.format === "CODE_128");
    const normalizedSku = item.sku?.trim() ? normalizeScanCode(item.sku) : "";
    const skuUnique =
      normalizedSku &&
      (skuOwners.get(normalizedSku)?.length ?? 0) === 1 &&
      skuOwners.get(normalizedSku)?.[0] === item.id;
    const skuAvailable = skuUnique && !assignedCodes.has(normalizedSku);

    if (!activeQr) {
      if (skuAvailable) {
        report.push({
          inventoryId: item.id,
          sku: item.sku,
          name: item.name,
          action: `assign QR_CODE EXISTING_PRINTED ${normalizedSku}`,
        });
        if (apply) {
          await assignScanCodeToInventory(
            item.id,
            item.sku,
            "QR_CODE",
            "EXISTING_PRINTED",
          );
          assignedCodes.add(normalizedSku);
        }
      } else {
        const generated = generateInternalDressCode();
        report.push({
          inventoryId: item.id,
          sku: item.sku,
          name: item.name,
          action: `generate QR_CODE ${generated} (${skuUnique ? "sku already mapped elsewhere" : "missing/duplicate sku"})`,
        });
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
      report.push({
        inventoryId: item.id,
        sku: item.sku,
        name: item.name,
        action: `generate CODE_128 ${generated}`,
      });
      if (apply) {
        await assignWithRetry(
          item.id,
          generated,
          "CODE_128",
          "SYSTEM_GENERATED_BARCODE",
        );
        assignedCodes.add(normalizeScanCode(generated));
      }
    }
  }

  console.log(
    `${dryRun ? "DRY RUN" : "APPLY"}: ${report.length} scan-code action(s) for ${items.length} inventory item(s).`,
  );
  for (const line of report.slice(0, 40)) {
    console.log(`#${line.inventoryId} ${line.sku} — ${line.name}: ${line.action}`);
  }
  if (report.length > 40) {
    console.log(`...and ${report.length - 40} more.`);
  }
  if (dryRun) {
    console.log("Dry run complete. No database writes were performed.");
  }
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
