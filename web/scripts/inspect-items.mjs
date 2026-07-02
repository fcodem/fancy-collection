import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const counts = await p.clothingItem.groupBy({ by: ["status"], _count: true });
console.log("status counts", counts);
const nonBench = await p.clothingItem.count({
  where: { sku: { not: { startsWith: "BENCH-" } } },
});
console.log("non-bench items", nonBench);
const list = await p.clothingItem.findMany({
  where: { sku: { not: { startsWith: "BENCH-" } } },
  select: { id: true, name: true, status: true, sku: true },
  take: 20,
});
console.log(list);
await p.$disconnect();
