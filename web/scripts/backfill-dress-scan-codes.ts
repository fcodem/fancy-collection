import prisma from "../src/lib/prisma";
import {
  assignScanCodeToInventory,
  generateInternalDressCode,
  InventoryScanCodeError,
} from "../src/lib/services/inventoryScanCode";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = args.has("--dry-run");

try {
  if (apply === dryRun) {
    console.error(
      "Choose exactly one mode: npm run backfill:dress-scan-codes -- --dry-run OR --apply",
    );
    process.exitCode = 2;
  } else {
    await run();
  }
} finally {
  await prisma.$disconnect();
}

async function run() {
  const inventory = await prisma.clothingItem.findMany({
    where: {
      scanCodes: { none: { active: true } },
    },
    orderBy: { id: "asc" },
    select: { id: true, sku: true, name: true },
  });

  console.log(
    `${dryRun ? "DRY RUN" : "APPLY"}: ${inventory.length} physical inventory unit(s) need a scan code.`,
  );

  if (dryRun) {
    for (const item of inventory.slice(0, 20)) {
      console.log(`Would assign an opaque internal QR code to ${item.sku} — ${item.name}`);
    }
    if (inventory.length > 20) {
      console.log(`...and ${inventory.length - 20} more.`);
    }
    console.log("Dry run complete. No database writes were performed.");
    return;
  }

  let created = 0;
  for (const item of inventory) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await assignScanCodeToInventory(
          item.id,
          generateInternalDressCode(),
          "QR_CODE",
          "SYSTEM_GENERATED_QR",
        );
        created += 1;
        break;
      } catch (error) {
        const collision =
          error instanceof InventoryScanCodeError &&
          error.code === "DUPLICATE_SCAN_CODE";
        if (collision && attempt < 5) continue;
        throw error;
      }
    }
  }
  console.log(`Created ${created} internal dress scan code(s).`);
}
