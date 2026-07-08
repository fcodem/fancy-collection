import prisma from "../src/lib/prisma";

async function main() {
  const deleted = await prisma.loginAttempt.deleteMany({});
  console.log("cleared_login_attempts", deleted.count);

  const owner = await prisma.user.findUnique({ where: { username: "owner" } });
  if (!owner) {
    console.log("owner_missing_run_seed");
    return;
  }
  console.log("owner_active", owner.active);
}

main().finally(() => prisma.$disconnect());
