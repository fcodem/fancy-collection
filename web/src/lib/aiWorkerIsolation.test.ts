import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "src");

function reach(entry: string): Set<string> {
  const seen = new Set<string>();
  const q = [entry];
  while (q.length) {
    const f = q.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of fs.readFileSync(f, "utf8").matchAll(/from\s*['"]([^'"]+)['"]/g)) {
      let base = m[1]!.startsWith("@/") ? path.join(src, m[1]!.slice(2)) : path.resolve(path.dirname(f), m[1]!);
      for (const c of [`${base}.ts`, base]) {
        if (fs.existsSync(c) && fs.statSync(c).isFile() && !seen.has(c)) q.push(c);
      }
    }
  }
  return seen;
}

const HEAVY = ["src/lib/siglipModel.ts", "src/lib/dressChecker/processInventory.ts", "src/lib/dressChecker/aiJobWorker.ts"];
const ROUTES = [
  "src/app/api/inventory/route.ts",
  "src/app/api/health/route.ts",
  "src/app/api/booking/route.ts",
  "src/app/api/return/[id]/save/route.ts",
  "src/app/api/dashboard/data/route.ts",
  "src/app/api/booking/date-check/route.ts",
  "src/app/api/dress-checker/scan-availability/route.ts",
];

describe("AI worker isolation from normal routes", () => {
  for (const rel of ROUTES) {
    it(`${rel} avoids native AI graph`, () => {
      const rels = new Set([...reach(path.join(root, rel))].map((f) => path.relative(root, f).replace(/\\/g, "/")));
      assert.deepEqual(HEAVY.filter((h) => rels.has(h)), []);
    });
  }
});
