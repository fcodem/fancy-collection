import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
try {
  const jobs = await p.whatsAppJob.findMany({
    where: { id: { in: [34, 35] } },
    include: {
      booking: {
        select: {
          id: true,
          customerName: true,
          contact1: true,
          whatsappNo: true,
          publicBookingId: true,
          monthlySerial: true,
          whatsappStatus: true,
          whatsappError: true,
        },
      },
    },
  });
  console.log("JOBS:", JSON.stringify(jobs, null, 2));

  const bIds = jobs.map((j) => j.bookingId).filter(Boolean);
  if (bIds.length) {
    const msgs = await p.whatsAppMessage.findMany({
      where: { bookingId: { in: bIds } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    console.log("MESSAGES:", JSON.stringify(msgs, null, 2));
  }
} finally {
  await p.$disconnect();
}
