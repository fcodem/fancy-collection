import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.clothingItem.findMany({
    where: {
      OR: [
        { name: { contains: "rajwada", mode: "insensitive" } },
        { name: { contains: "floral", mode: "insensitive" } },
        { name: { contains: "sabesachi", mode: "insensitive" } },
        { sku: { in: ["ITM-1039", "ITM-0027", "ITM-1040", "ITM-1035"] } },
      ],
    },
    select: {
      id: true,
      sku: true,
      name: true,
      photo: true,
      status: true,
      identificationIndex: true,
      aiProfile: { select: { status: true, recognitionVersion: true } },
    },
    orderBy: { sku: "asc" },
  });
  for (const item of items) {
    const hasIndex = item.identificationIndex != null;
    const aiVer = item.aiProfile?.recognitionVersion ?? 0;
    console.log(`${item.sku} id=${item.id} ${item.name} photo=${!!item.photo} index=${hasIndex} aiV=${aiVer}`);
  }
  const total = await prisma.clothingItem.count({ where: { photo: { not: null } } });
  console.log(`\nTotal items with photo: ${total}`);
  const all = await prisma.clothingItem.findMany({
    where: { photo: { not: null } },
    select: { sku: true, name: true },
    orderBy: { sku: "asc" },
  });
  console.log("All indexed catalog:");
  for (const i of all) console.log(`  ${i.sku} ${i.name}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
