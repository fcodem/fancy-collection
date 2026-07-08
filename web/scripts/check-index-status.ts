import prisma from "../src/lib/prisma";
import { parseIdentificationIndex } from "../src/lib/dressIdentificationIndex";

async function main() {
  const items = await prisma.clothingItem.findMany({
    where: { photo: { not: null }, NOT: { photo: "" } },
    select: { sku: true, identificationIndex: true, identificationIndexedAt: true, siglipIndexedAt: true },
  });
  let v3 = 0;
  let stale = 0;
  let none = 0;
  for (const item of items) {
    if (parseIdentificationIndex(item.identificationIndex)) v3++;
    else if (item.siglipIndexedAt || item.identificationIndexedAt) stale++;
    else none++;
  }
  console.log(JSON.stringify({ total: items.length, v3_index: v3, stale_legacy: stale, not_indexed: none }, null, 2));
}

main().finally(() => prisma.$disconnect());
