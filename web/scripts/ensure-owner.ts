/**
 * Ensure owner login exists (Vercel build). Uses DIRECT_URL when set.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  const existing = await prisma.user.findUnique({ where: { username: "owner" } });

  if (!existing) {
    await prisma.user.create({
      data: {
        username: "owner",
        passwordHash,
        role: "owner",
        active: true,
      },
    });
    console.log("[ensure-owner] created owner / admin123");
    return;
  }

  if (!existing.active || process.env.SEED_RESET_OWNER === "1") {
    await prisma.user.update({
      where: { username: "owner" },
      data: { passwordHash, active: true, role: "owner" },
    });
    console.log("[ensure-owner] reset owner / admin123");
    return;
  }

  console.log("[ensure-owner] owner already present");
}

main()
  .catch((e) => {
    console.error("[ensure-owner] failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
