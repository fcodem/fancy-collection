import { prisma } from "../src/lib/db";
import { ensureOwnerExists } from "../src/lib/auth";

async function main() {
  await ensureOwnerExists();
  console.log("Seed complete. Default owner: owner / (see OWNER_DEFAULT_PASSWORD in .env)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
