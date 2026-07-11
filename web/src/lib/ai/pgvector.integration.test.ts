import { existsSync, readFileSync } from "fs";
import { join } from "path";
import assert from "node:assert/strict";
import test from "node:test";

function loadDotEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key]) continue;
    process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}

function parseVectorLiteral(raw: string): number[] {
  return raw
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((v) => Number(v.trim()));
}

loadDotEnv();

test("pgvector candidate query and hydration execute against the real database", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is not configured");
    return;
  }
  const [{ default: prisma }, { searchInventoryByPgvector }, { loadCatalogCandidatesByIds }] =
    await Promise.all([
      import("../prisma"),
      import("./pgvector"),
      import("../dressChecker/catalog"),
    ]);

  const rows = await prisma.$queryRawUnsafe<Array<{ item_id: number; vector: string }>>(
    `SELECT item_id, embedding_vector::text AS vector
     FROM inventory_ai_profiles
     WHERE embedding_vector IS NOT NULL
     ORDER BY item_id ASC
     LIMIT 1`,
  );
  if (!rows.length) {
    t.skip("No pgvector embeddings are indexed");
    return;
  }

  const embedding = parseVectorLiteral(rows[0].vector);
  assert.equal(embedding.length, 768);

  const search = await searchInventoryByPgvector(embedding, 5);
  assert.equal(search.ok, true, search.ok ? undefined : search.reason);
  if (!search.ok) return;
  assert.ok(search.candidates.length > 0);

  const hydrated = await loadCatalogCandidatesByIds(search.candidates.map((c) => c.itemId));
  assert.ok(hydrated.size > 0);
  assert.ok(hydrated.has(rows[0].item_id));
});
