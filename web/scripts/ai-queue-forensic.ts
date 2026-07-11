import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const p = new PrismaClient();

async function main() {
  const jobsByStatus = await p.$queryRawUnsafe<Array<{ status: string; c: number }>>(
    `SELECT status, COUNT(*)::int AS c FROM inventory_ai_jobs GROUP BY status ORDER BY c DESC`,
  ).catch((e) => [{ status: "ERROR", c: 0, err: String(e) } as never]);

  const profilesByStatus = await p.$queryRawUnsafe<Array<{ s: string; c: number }>>(
    `SELECT COALESCE(NULLIF(ai_status,''), UPPER(status), 'PENDING') AS s, COUNT(*)::int AS c
     FROM inventory_ai_profiles GROUP BY 1 ORDER BY c DESC`,
  ).catch((e) => [{ s: "ERROR", c: 0, err: String(e) } as never]);

  const versionGaps = await p.$queryRawUnsafe<Array<Record<string, number>>>(
    `SELECT COUNT(*)::int AS total_with_photo,
      COUNT(*) FILTER (WHERE p.item_id IS NULL)::int AS no_profile,
      COUNT(*) FILTER (WHERE COALESCE(p.matching_version,0) < 9)::int AS matching_lt9,
      COUNT(*) FILTER (WHERE COALESCE(p.recognition_version,0) < 9)::int AS recognition_lt9,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(regexp_replace(COALESCE(p.pipeline_version,'0'),'[^0-9]','','g'),''),'0')::int < 9)::int AS pipeline_lt9,
      COUNT(*) FILTER (WHERE p.embedding_vector IS NULL)::int AS missing_embedding,
      COUNT(*) FILTER (WHERE p.embroidery_signature IS NULL OR p.border_signature IS NULL OR p.motif_signature IS NULL OR p.texture_signature IS NULL OR p.panel_signature IS NULL OR p.stone_signature IS NULL)::int AS missing_sigs,
      COUNT(*) FILTER (WHERE p.colour_analysis IS NULL AND p.dominant_color IS NULL)::int AS missing_colour,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(p.ai_status,''), UPPER(p.status),'') = 'READY')::int AS ready,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(p.ai_status,''), UPPER(p.status),'') = 'STALE')::int AS stale,
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(p.ai_status,''), UPPER(p.status),'') = 'FAILED')::int AS failed,
      COUNT(*) FILTER (WHERE COALESCE(p.needs_reindex,false)=true)::int AS needs_reindex
    FROM clothing_items c
    LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
    WHERE c.photo IS NOT NULL AND c.photo <> ''`,
  );

  const stuck = await p.$queryRawUnsafe(
    `SELECT id, item_id, status, locked_at, started_at, updated_at, retry_count, error_message
     FROM inventory_ai_jobs WHERE status = 'PROCESSING'
     ORDER BY updated_at ASC NULLS FIRST LIMIT 20`,
  ).catch(() => []);

  const failedJobs = await p.$queryRawUnsafe(
    `SELECT id, item_id, status, retry_count, error_message, last_error, updated_at
     FROM inventory_ai_jobs WHERE status='FAILED' ORDER BY updated_at DESC LIMIT 20`,
  ).catch(() => []);

  const pending = await p.$queryRawUnsafe(
    `SELECT id, item_id, status, priority, reason, created_at, next_retry_at
     FROM inventory_ai_jobs WHERE status IN ('PENDING','RETRYING')
     ORDER BY priority ASC, id ASC LIMIT 30`,
  ).catch(() => []);

  const incompleteItems = await p.$queryRawUnsafe(
    `SELECT c.id, c.sku, c.name,
       COALESCE(NULLIF(p.ai_status,''), UPPER(p.status),'NONE') AS ai_status,
       p.pipeline_version, p.recognition_version, p.matching_version,
       (p.embedding_vector IS NOT NULL) AS has_embedding,
       (p.embroidery_signature IS NOT NULL) AS has_embroidery,
       (p.colour_analysis IS NOT NULL OR p.dominant_color IS NOT NULL) AS has_colour,
       p.needs_reindex
     FROM clothing_items c
     LEFT JOIN inventory_ai_profiles p ON p.item_id = c.id
     WHERE c.photo IS NOT NULL AND c.photo <> ''
       AND (
         p.item_id IS NULL
         OR COALESCE(NULLIF(p.ai_status,''), UPPER(p.status),'') <> 'READY'
         OR COALESCE(p.matching_version,0) < 9
         OR COALESCE(p.recognition_version,0) < 9
         OR COALESCE(NULLIF(regexp_replace(COALESCE(p.pipeline_version,'0'),'[^0-9]','','g'),''),'0')::int < 9
         OR p.embedding_vector IS NULL
         OR p.embroidery_signature IS NULL
         OR p.border_signature IS NULL
         OR p.motif_signature IS NULL
         OR p.texture_signature IS NULL
         OR p.panel_signature IS NULL
         OR p.stone_signature IS NULL
         OR (p.colour_analysis IS NULL AND p.dominant_color IS NULL)
         OR COALESCE(p.needs_reindex,false)=true
       )
     ORDER BY c.id ASC
     LIMIT 50`,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    jobsByStatus,
    profilesByStatus,
    versionGaps: versionGaps[0] || {},
    stuck,
    failedJobs,
    pending,
    incompleteItems,
  };

  const out = join(process.cwd(), "scripts", ".ai-queue-forensic.json");
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log("Wrote", out);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
