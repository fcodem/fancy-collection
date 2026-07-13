import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { isWerkzeugHash } from "../src/lib/werkzeugPassword";

const prisma = new PrismaClient();

async function ensureOwnerExists() {
  const password =
    process.env.OWNER_SEED_PASSWORD?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : "ChangeMe-LocalOnly-16+");
  if (!password || password.length < 16) {
    throw new Error(
      "Set OWNER_SEED_PASSWORD to a 16+ character password before seeding. Never use short defaults in production.",
    );
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await prisma.user.findUnique({ where: { username: "owner" } });
  if (!owner) {
    await prisma.user.create({
      data: {
        username: "owner",
        passwordHash,
        role: "owner",
        active: true,
      },
    });
    console.log("Owner account created. Username: owner (password from OWNER_SEED_PASSWORD / local default).");
    return;
  }

  if (!owner.active || isWerkzeugHash(owner.passwordHash)) {
    await prisma.user.update({
      where: { username: "owner" },
      data: { passwordHash, active: true, role: "owner" },
    });
  }
}

async function seedDatabase() {
  const existing = await prisma.customer.findFirst();
  if (existing) return;
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
  console.log("Done. Change the owner password after first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
