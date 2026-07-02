import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const r = await prisma.whatsAppJob.updateMany({
  where: { status: "processing" },
  data: { status: "pending", failedReason: "Reset from stuck processing" },
});
console.log(`Reset ${r.count} stuck job(s) to pending`);
await prisma.$disconnect();
