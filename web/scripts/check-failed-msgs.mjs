import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const m = await p.whatsAppMessage.findMany({
  where: { id: { in: [39, 40, 48, 49] } },
  select: { id: true, error: true, bookingId: true },
});
console.log(m);
await p.$disconnect();
