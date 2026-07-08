import { processInventoryAiProfile } from "../src/lib/dressChecker/processInventory";
import prisma from "../src/lib/prisma";

async function main() {
  const item = await prisma.clothingItem.findFirst({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: { id: true, sku: true, name: true },
  });
  if (!item) {
    console.log("No items with photos");
    return;
  }
  console.log(`Processing ${item.sku} (${item.id})…`);
  try {
    const ok = await processInventoryAiProfile(item.id, "debug");
    console.log("Result:", ok);
  } catch (err) {
    console.error("Failed:", err);
  }
}

main().catch(console.error);
