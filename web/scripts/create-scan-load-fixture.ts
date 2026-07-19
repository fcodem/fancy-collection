/** Local/test-only fixture for the 5 staff × 10 scan endpoint load test. */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { sealData } from "iron-session";

loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL || "";
if (
  !/127\.0\.0\.1|localhost|fancy_test|:5432\/test/i.test(url) &&
  process.env.ALLOW_PROD_INTEGRATION !== "1"
) {
  throw new Error("Refusing scan load fixture outside a local/test database");
}

const outputDir = path.join(process.cwd(), ".data", "e2e");
const fixturePath = path.join(outputDir, "scan-load-fixture.json");
const prisma = new PrismaClient();

function password(): string {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length >= 32) return secret;
  if (secret) {
    return (secret + "pad-fancy-collection-session-secret-32").slice(0, 48);
  }
  return "dev-only-change-in-production-min-32-chars!!";
}

type Fixture = {
  userIds: number[];
  sessionIds: string[];
  inventoryIds: number[];
  cookies: string[];
  codes: string[];
};

async function cleanup(fixture?: Fixture) {
  const saved =
    fixture ??
    (fs.existsSync(fixturePath)
      ? (JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Fixture)
      : null);
  if (!saved) return;
  await prisma.userSession.deleteMany({
    where: { sessionId: { in: saved.sessionIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: saved.userIds } } });
  await prisma.clothingItem.deleteMany({
    where: { id: { in: saved.inventoryIds } },
  });
  fs.rmSync(fixturePath, { force: true });
  console.log("[scan-load-fixture] cleaned");
}

async function create() {
  if (fs.existsSync(fixturePath)) await cleanup();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  const fixture: Fixture = {
    userIds: [],
    sessionIds: [],
    inventoryIds: [],
    cookies: [],
    codes: [],
  };
  try {
    for (let index = 0; index < 5; index += 1) {
      const user = await prisma.user.create({
        data: {
          username: `e2e-scan-load-${suffix}-${index}`,
          passwordHash: "e2e-load-test-no-login",
          role: "staff",
          active: true,
        },
      });
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
          staffId: null,
        },
        { password: password(), ttl: 60 * 60 },
      );
      fixture.userIds.push(user.id);
      fixture.sessionIds.push(sessionId);
      fixture.cookies.push(`fancy_collection_session=${sealed}`);
    }

    for (let index = 0; index < 10; index += 1) {
      const code = `FC-D-LOAD-${suffix}-${index}`.toUpperCase();
      const item = await prisma.clothingItem.create({
        data: {
          name: `Load Test Dress ${index}`,
          sku: `IT-LOAD-${suffix}-${index}`,
          category: "Integration",
          status: "available",
          scanCodes: {
            create: {
              code,
              normalizedCode: code,
              format: "QR_CODE",
              source: "SYSTEM_GENERATED_QR",
              isPrimary: true,
            },
          },
        },
      });
      fixture.inventoryIds.push(item.id);
      fixture.codes.push(code);
    }

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    console.log(`[scan-load-fixture] wrote ${fixturePath}`);
  } catch (error) {
    await cleanup(fixture);
    throw error;
  }
}

(process.argv.includes("--cleanup") ? cleanup() : create())
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(
      "[scan-load-fixture]",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
