/**
 * Set or rotate the owner password against DATABASE_URL.
 *
 * Usage (never commit the password):
 *   OWNER_NEW_PASSWORD="your-16+-char-password" npx tsx scripts/set-owner-password.ts
 *
 * Invalidates all owner sessions after update.
 */
import bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";
import { assertStrongPassword } from "../src/lib/passwordPolicy";

async function main() {
  const password = process.env.OWNER_NEW_PASSWORD?.trim() || "";
  assertStrongPassword(password, { role: "owner", username: "owner" });

  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await prisma.user.upsert({
    where: { username: "owner" },
    create: { username: "owner", passwordHash, role: "owner", active: true },
    update: { passwordHash, active: true, role: "owner" },
  });

  await prisma.userSession.updateMany({
    where: { userId: owner.id, active: true },
    data: { active: false, endedAt: new Date() },
  });

  console.log(`Owner password updated for user id=${owner.id}. All owner sessions invalidated.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
