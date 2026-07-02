import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.booking.findMany({
  where: {
    OR: [
      { customerName: { contains: "SLIP TEST" } },
      { id: { in: [15344, 15345, 15346] } },
    ],
  },
  select: {
    id: true,
    customerName: true,
    status: true,
    whatsappNo: true,
    bookingItems: {
      select: { id: true, isIncompleteReturn: true, isDelivered: true, isReturned: true },
    },
  },
  orderBy: { id: "asc" },
});
console.log(JSON.stringify(rows, null, 2));
await p.$disconnect();
