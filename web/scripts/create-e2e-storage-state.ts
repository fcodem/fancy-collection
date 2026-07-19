/**
 * Create/clean a short-lived authenticated Playwright storage state for local
 * test databases. Refuses remote/production databases and never prints cookie
 * contents or the session secret.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { sealData } from "iron-session";

loadEnvConfig(process.cwd());

// Playwright clears test-results at startup, so keep auth state in the
// gitignored local data directory instead.
const outputDir = path.join(process.cwd(), ".data", "e2e");
const statePath = path.join(outputDir, "e2e-storage-state.json");
const sessionPath = path.join(outputDir, "e2e-session-id.txt");
const url = process.env.DATABASE_URL || "";

if (
  !/127\.0\.0\.1|localhost|fancy_test|:5432\/test/i.test(url) &&
  process.env.ALLOW_PROD_INTEGRATION !== "1"
) {
  throw new Error("Refusing to create E2E session outside a local/test database");
}

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length >= 32) return secret;
  if (secret.length > 0) {
    return (secret + "pad-fancy-collection-session-secret-32").slice(0, 48);
  }
  return "dev-only-change-in-production-min-32-chars!!";
}

const prisma = new PrismaClient();

async function cleanup() {
  const sessionId = fs.existsSync(sessionPath)
    ? fs.readFileSync(sessionPath, "utf8").trim()
    : "";
  if (sessionId) {
    await prisma.userSession.updateMany({
      where: { sessionId },
      data: { active: false, endedAt: new Date() },
    });
  }
  fs.rmSync(statePath, { force: true });
  fs.rmSync(sessionPath, { force: true });
  console.log("[e2e-session] cleaned");
}

async function create() {
  const user = await prisma.user.findFirst({
    where: { active: true },
    orderBy: { id: "asc" },
    select: { id: true, username: true, role: true, staffId: true },
  });
  if (!user) throw new Error("Local test database has no active user");

  const sessionId = randomUUID().replace(/-/g, "");
  await prisma.userSession.create({
    data: { userId: user.id, sessionId, active: true },
  });
  const sealed = await sealData(
    {
      userId: user.id,
      sessionId,
      username: user.username,
      role: user.role,
      staffId: user.staffId,
    },
    { password: sessionPassword(), ttl: 60 * 60 },
  );

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      cookies: [
        {
          name: "fancy_collection_session",
          value: sealed,
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );
  fs.writeFileSync(sessionPath, sessionId);
  console.log(`[e2e-session] wrote ${statePath}`);
}

(process.argv.includes("--cleanup") ? cleanup() : create())
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error("[e2e-session]", error instanceof Error ? error.message : error);
    process.exit(1);
  });
