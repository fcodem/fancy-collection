import { PrismaClient } from "@prisma/client";
import { enqueueInventoryAiJob } from "../src/lib/dressChecker/aiJobQueue";
import { drainAiJobQueue } from "../src/lib/dressChecker/aiJobWorker";
import { IDENTIFICATION_INDEX_VERSION } from "../src/lib/dressIdentificationTypes";
import { DRESS_CHECKER_ENGINE_VERSION } from "../src/lib/dressChecker/constants";

const prisma = new PrismaClient();

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argNumber(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=").slice(1).join("="));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function currentCounts() {
  const rows = await prisma.$queryRawUnsafe<Array<{ version: string; c: number }>>(
    `SELECT COALESCE(identification_index->>'version', 'missing') AS version, COUNT(*)::int AS c
     FROM clothing_items
     WHERE photo IS NOT NULL AND photo <> ''
     GROUP BY 1
     ORDER BY 1`,
  );
  return rows;
}

async function main() {
  const dryRun = hasArg("dry-run");
  const all = hasArg("all");
  const force = hasArg("force");
  const resume = hasArg("resume");
  const withOpenAi = hasArg("with-openai");
  const drainLimit = argNumber("drain-limit", 50);
  const limit = argNumber("limit", 500);

  if (!withOpenAi && !process.env.DRESS_CHECKER_OPENAI_ENABLED) {
    process.env.DRESS_CHECKER_OPENAI_ENABLED = "0";
  }

  const whereSql =
    all && force && !resume
      ? `c.photo IS NOT NULL AND c.photo <> ''`
      : `c.photo IS NOT NULL AND c.photo <> ''
         AND (
           c.identification_index IS NULL
           OR COALESCE(NULLIF(regexp_replace(c.identification_index->>'version', '[^0-9]', '', 'g'), ''), '0')::int < $1
           OR p.item_id IS NULL
           OR p.ai_status IS DISTINCT FROM 'READY'
           OR COALESCE(p.needs_reindex, false) = true
           OR COALESCE(p.matching_version, 0) < $2
         )`;

  const params = all && force && !resume ? [limit] : [IDENTIFICATION_INDEX_VERSION, DRESS_CHECKER_ENGINE_VERSION, limit];
  const rows = await prisma.$queryRawUnsafe<Array<{ item_id: number; sku: string; version: string | null }>>(
    `SELECT c.id AS item_id, c.sku, c.identification_index->>'version' AS version
     FROM clothing_items c
     LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
     WHERE ${whereSql}
     ORDER BY c.id ASC
     LIMIT $${params.length}`,
    ...params,
  );

  const countsBefore = await currentCounts();
  console.log(
    JSON.stringify(
      {
        dryRun,
        all,
        force,
        resume,
        withOpenAi,
        targetIndexVersion: IDENTIFICATION_INDEX_VERSION,
        engineVersion: DRESS_CHECKER_ENGINE_VERSION,
        countsBefore,
        candidates: rows.length,
        sample: rows.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  let enqueued = 0;
  for (const row of rows) {
    await enqueueInventoryAiJob({
      itemId: row.item_id,
      reason: `reindex_v${IDENTIFICATION_INDEX_VERSION}`,
      priority: 10,
      staleExisting: true,
    });
    enqueued++;
  }

  const drained = await drainAiJobQueue(drainLimit);
  const countsAfter = await currentCounts();
  console.log(JSON.stringify({ enqueued, drained, countsAfter }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
