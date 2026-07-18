import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");

/** Resolve an import specifier to an on-disk src file, or null if external/unresolvable. */
function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(srcDir, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // external package
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** Static (non-dynamic) import + re-export specifiers in a file. */
function staticSpecifiers(content: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /import\s+[^;'"]*?from\s*['"]([^'"]+)['"]/gs,
    /export\s+[^;'"]*?from\s*['"]([^'"]+)['"]/gs,
    /import\s+['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) specs.push(m[1]!);
  }
  return specs;
}

/** BFS the static import graph from an entry file. Returns reachable src files. */
function staticReachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const content = fs.readFileSync(file, "utf8");
    for (const spec of staticSpecifiers(content)) {
      const resolved = resolveSpec(file, spec);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

/** Modules that load the transformer / native model graph. */
const HEAVY_MODULES = [
  "src/lib/siglipModel.ts",
  "src/lib/dressChecker/processInventory.ts",
  "src/lib/recognitionPipeline/processInventory.ts",
  "src/lib/ai/imageEmbedding/backends.ts",
];

/** Normal business routes that must never statically load the model graph. */
const NORMAL_ROUTES = [
  "src/app/api/inventory/route.ts",
  "src/app/api/inventory/[id]/route.ts",
  "src/app/api/health/route.ts",
  "src/app/api/booking/route.ts",
  "src/app/api/booking-delivery/[id]/save/route.ts",
  "src/app/api/return/[id]/save/route.ts",
];

describe("AI worker isolation from normal routes", () => {
  for (const rel of NORMAL_ROUTES) {
    it(`${rel} does not statically import the model graph`, () => {
      const entry = path.join(root, rel);
      if (!fs.existsSync(entry)) {
        assert.fail(`entry not found: ${rel}`);
      }
      const reachable = staticReachable(entry);
      const reachableRel = new Set(
        [...reachable].map((f) => path.relative(root, f).replace(/\\/g, "/")),
      );
      const leaked = HEAVY_MODULES.filter((m) => reachableRel.has(m));
      assert.deepEqual(
        leaked,
        [],
        `${rel} statically reaches heavy AI modules: ${leaked.join(", ")}`,
      );
      // Also: no statically reachable file may import @xenova/transformers/onnx.
      for (const file of reachable) {
        const specs = staticSpecifiers(fs.readFileSync(file, "utf8"));
        const bad = specs.filter(
          (s) => s === "@xenova/transformers" || s === "onnxruntime-node",
        );
        assert.deepEqual(
          bad,
          [],
          `${path.relative(root, file)} statically imports ${bad.join(", ")}`,
        );
      }
    });
  }

  it("worker path CAN reach the model graph (dynamic on the cron route)", () => {
    // The cron worker route drains the queue; the model graph is loaded lazily
    // inside processOneAiJob via dynamic import, so it must NOT be statically
    // reachable even here — proving the graph is always deferred.
    const entry = path.join(root, "src/app/api/cron/ai-job-worker/route.ts");
    if (!fs.existsSync(entry)) return; // route optional
    const reachableRel = new Set(
      [...staticReachable(entry)].map((f) => path.relative(root, f).replace(/\\/g, "/")),
    );
    for (const m of HEAVY_MODULES) {
      assert.ok(
        !reachableRel.has(m),
        `${m} should be dynamically imported by the worker, not statically reachable`,
      );
    }
  });
});
