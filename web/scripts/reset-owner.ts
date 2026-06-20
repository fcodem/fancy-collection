import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { isWerkzeugHash } from "../src/lib/werkzeugPassword";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const owner = await prisma.user.upsert({
    where: { username: "owner" },
    update: {
      passwordHash,
      active: true,
      role: "owner",
    },
    create: {
      username: "owner",
      passwordHash,
      role: "owner",
      active: true,
    },
  });

  console.log(`Owner account reset (id=${owner.id}). Login: owner / admin123`);

  // Migrate any remaining Flask/Werkzeug password hashes and re-activate accounts.
  const legacy = await prisma.user.findMany({
    where: { NOT: { username: "owner" } },
    select: { id: true, username: true, passwordHash: true, active: true },
  });
  for (const u of legacy) {
    if (isWerkzeugHash(u.passwordHash) || !u.active) {
      await prisma.user.update({
        where: { id: u.id },
        data: { active: true },
      });
      console.log(`Re-activated legacy account: ${u.username} (password unchanged — use your existing password)`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
