/**
 * Local password reset for owner — requires OWNER_BOOTSTRAP_PASSWORD (16+).
 * Disabled when VERCEL=1.
 */
import bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";

async function main() {
  if (process.env.VERCEL === "1") {
    throw new Error("reset-owner is disabled on Vercel. Change password in-app as owner.");
  }
  const password = process.env.OWNER_BOOTSTRAP_PASSWORD?.trim() || "";
  if (password.length < 16) {
    throw new Error("Set OWNER_BOOTSTRAP_PASSWORD to a 16+ character password.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await prisma.user.upsert({
    where: { username: "owner" },
    create: { username: "owner", passwordHash, role: "owner", active: true },
    update: { passwordHash, active: true, role: "owner" },
  });
  console.log(`Owner account reset (id=${owner.id}). Username: owner. Password: from OWNER_BOOTSTRAP_PASSWORD.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
