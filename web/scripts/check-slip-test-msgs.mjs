import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const ids = [15344, 15345, 15346];
const msgs = await p.whatsAppMessage.findMany({
  where: { bookingId: { in: ids } },
  orderBy: { id: "asc" },
  select: { id: true, bookingId: true, phone: true, status: true, body: true, messageType: true, error: true },
});
console.log("messages", msgs.length);
for (const m of msgs) {
  console.log(`#${m.id} booking ${m.bookingId} ${m.messageType} ${m.status} → ${m.phone} | ${(m.body || "").slice(0, 60)}`);
}
const failed = msgs.filter((m) => m.status === "failed");
console.log("failed", failed.length);
await p.$disconnect();
