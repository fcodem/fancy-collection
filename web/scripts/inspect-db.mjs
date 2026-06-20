import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const tests = [
  () => p.clothingItem.findFirst(),
  () => p.user.findFirst(),
  () => p.staff.findFirst(),
  () => p.booking.findFirst({ include: { bookingItems: true } }),
  () => p.customCategory.findMany(),
];

for (const t of tests) {
  try {
    const r = await t();
    console.log("OK", t.toString().slice(0, 60), r ? "has data" : "empty");
  } catch (e) {
    console.log("FAIL", t.toString().slice(0, 60), e?.code, e?.message?.split("\n")[0]);
  }
}

await p.$disconnect();

