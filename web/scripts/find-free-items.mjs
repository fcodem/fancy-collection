import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const delivery = process.argv[2] || "2026-06-10";
const returnD = process.argv[3] || "2026-08-06";

// dynamic import booking conflict - use raw query approach via prisma
const items = await p.clothingItem.findMany({
  where: { status: "available", sku: { not: { startsWith: "BENCH-" } } },
  take: 50,
  orderBy: { id: "asc" },
});

const { findFirstItemConflict } = await import("../src/lib/booking.ts");
let ok = 0;
for (const it of items) {
  const c = await findFirstItemConflict([it.id], delivery, returnD);
  if (!c) {
    console.log("free", it.id, it.name);
    ok++;
  }
}
console.log("total free", ok, "for", delivery, returnD);
await p.$disconnect();
