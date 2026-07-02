import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const msgs = await p.whatsAppMessage.findMany({
  where: { bookingId: { in: [15344, 15346] }, status: "failed" },
  orderBy: { id: "asc" },
});
console.log(JSON.stringify(msgs, null, 2));
await p.$disconnect();
