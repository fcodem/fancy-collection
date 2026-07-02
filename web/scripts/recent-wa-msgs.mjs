import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const msgs = await p.whatsAppMessage.findMany({
  where: { phone: { contains: "8077843874" } },
  orderBy: { id: "desc" },
  take: 15,
  select: {
    id: true,
    messageType: true,
    status: true,
    deliveryStatus: true,
    error: true,
    filename: true,
    createdAt: true,
  },
});
console.log(JSON.stringify(msgs, null, 2));
await p.$disconnect();
