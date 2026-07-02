import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const jobs = await p.whatsAppJob.findMany({
  where: { bookingId: 15344 },
  orderBy: { id: "asc" },
  select: { id: true, jobType: true, status: true, failedReason: true, payload: true },
});
for (const j of jobs) {
  const pl = j.payload || {};
  console.log(j.id, j.jobType, j.status, pl?.scope, j.failedReason || "");
}
await p.$disconnect();
