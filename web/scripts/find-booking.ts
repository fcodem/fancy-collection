import prisma from "../src/lib/prisma";

const name = process.argv[2] || "raghav";

async function main() {
  const rows = await prisma.booking.findMany({
    where: { customerName: { contains: name, mode: "insensitive" } },
    orderBy: { id: "desc" },
    take: 10,
    select: {
      id: true,
      customerName: true,
      publicBookingId: true,
      monthlySerial: true,
      status: true,
      createdAt: true,
      whatsappNo: true,
      qrCodeUrl: true,
    },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main().finally(() => prisma.$disconnect());
