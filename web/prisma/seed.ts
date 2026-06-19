import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureOwnerExists() {
  const owner = await prisma.user.findUnique({ where: { username: "owner" } });
  if (!owner) {
    await prisma.user.create({
      data: {
        username: "owner",
        passwordHash: await bcrypt.hash("admin123", 10),
        role: "owner",
        active: true,
      },
    });
  }
}

async function seedDatabase() {
  const existing = await prisma.customer.findFirst();
  if (existing) return;
  await prisma.customer.createMany({
    data: [
      { name: "Priya Sharma", phone: "9876543210", email: "priya@email.com", address: "Mumbai" },
      { name: "Rahul Mehta", phone: "9123456780", email: "rahul@email.com", address: "Delhi" },
    ],
  });
  await prisma.clothingItem.createMany({
    data: [
      { name: "Red Bridal Lehenga", sku: "LRG-001", category: "Lehenga", itemType: "clothing", size: "M", color: "Red", dailyRate: 2500, deposit: 10000 },
      { name: "Royal Blue Sherwani", sku: "SHR-001", category: "Sherwani", itemType: "clothing", size: "L", color: "Blue", dailyRate: 1800, deposit: 8000 },
    ],
  });
}

async function main() {
  console.log("Seeding database...");
  await ensureOwnerExists();
  await seedDatabase();
  console.log("Done. Default owner login: owner / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
