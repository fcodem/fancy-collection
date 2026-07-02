import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const jobs = await p.whatsAppJob.findMany({
    orderBy: { id: "desc" },
    take: 20,
    include: {
      booking: {
        select: {
          customerName: true,
          whatsappNo: true,
          contact1: true,
          publicBookingId: true,
          status: true,
        },
      },
    },
  });
  console.log("RECENT JOBS:", jobs.length);
  console.log(JSON.stringify(jobs, null, 2));

  const pending = await p.whatsAppJob.count({ where: { status: "pending" } });
  const processing = await p.whatsAppJob.count({ where: { status: "processing" } });
  const failed = await p.whatsAppJob.findMany({
    where: { status: "failed" },
    orderBy: { id: "desc" },
    take: 5,
  });
  console.log("\nCOUNTS:", { pending, processing, failed: failed.length });
  if (failed.length) console.log("FAILED:", JSON.stringify(failed, null, 2));

  const msgs = await p.whatsAppMessage.findMany({
    orderBy: { id: "desc" },
    take: 10,
  });
  console.log("\nRECENT MESSAGES:", JSON.stringify(msgs, null, 2));
} finally {
  await p.$disconnect();
}
