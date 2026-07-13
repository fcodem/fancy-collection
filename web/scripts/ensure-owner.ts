/**
 * Local/dev helper — never use a fixed password on Vercel production.
 * Set OWNER_BOOTSTRAP_PASSWORD (16+) in env, or SCRIPT will refuse.
 */
import bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";

async function main() {
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    throw new Error(
      "ensure-owner is disabled in production. Set a password via your secure ops process, not this script.",
    );
  }
  const password = process.env.OWNER_BOOTSTRAP_PASSWORD?.trim() || "";
  if (password.length < 16) {
    throw new Error("Set OWNER_BOOTSTRAP_PASSWORD to a 16+ character password.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { username: "owner" } });
  const shouldReset = process.env.SEED_RESET_OWNER === "1";
  if (!existing) {
    await prisma.user.create({
      data: { username: "owner", passwordHash, role: "owner", active: true },
    });
    console.log("[ensure-owner] created owner (password from OWNER_BOOTSTRAP_PASSWORD)");
    return;
  }
  if (shouldReset) {
    await prisma.user.update({
      where: { username: "owner" },
      data: { passwordHash, active: true, role: "owner" },
    });
    console.log("[ensure-owner] reset owner password from OWNER_BOOTSTRAP_PASSWORD");
  } else {
    console.log("[ensure-owner] owner already exists (no reset)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
