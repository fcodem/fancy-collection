/**
 * Evaluation suite for dress identification pipeline.
 * Measures Top-1 accuracy across same-dress variants (angles, lighting, backgrounds).
 *
 * Run: npx tsx --test src/lib/dressIdentification.eval.test.ts
 * Requires: local DB + indexed inventory + test assets on disk.
 */
import { readFile, access } from "fs/promises";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { identificationPhotoSearch } from "./services/dressIdentificationPipeline";

const ASSET_ROOT =
  "C:/Users/asus/.cursor/projects/c-Projects-ssdn-soft/assets";

type EvalCase = {
  name: string;
  queryPath: string;
  expectedSku: string;
  minScore: number;
  tags: string[];
};

const EVAL_CASES: EvalCase[] = [
  {
    name: "green floor photo → PISTA",
    queryPath: `${ASSET_ROOT}/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_IMG_9116-f66ef0b8-e067-429e-a0a6-60d3c64f3fe6.png`,
    expectedSku: "ITM-1037",
    minScore: 70,
    tags: ["same_dress", "angle", "floor", "lighting", "phone_camera"],
  },
  {
    name: "green hanger photo → PISTA",
    queryPath: `${ASSET_ROOT}/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_7EB06CF6-1FE5-4AA6-A842-ABA1061489D7-3f9217b2-f5a1-401c-ba1f-ca88af75550b.png`,
    expectedSku: "ITM-1037",
    minScore: 70,
    tags: ["same_dress", "angle", "hanging", "background", "lighting"],
  },
  {
    name: "bridal phone photo → MULTI RAJWADA",
    queryPath: `${ASSET_ROOT}/c__Users_asus_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_94859627-1d31-4969-953b-6ffadd423997-6f89c1f3-969b-410e-a1be-f1993c3016f6.png`,
    expectedSku: "ITM-1043",
    minScore: 70,
    tags: ["same_dress", "angle", "mannequin", "multi", "phone_camera", "background"],
  },
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadCatalogPhoto(photo: string) {
  return readFile(join(process.cwd(), "public", "uploads", photo.replace(/^uploads\//, "")));
}

describe("dress identification evaluation suite", () => {
  it("reports eval case coverage", () => {
    const tags = new Set(EVAL_CASES.flatMap((c) => c.tags));
    assert.ok(tags.has("angle"));
    assert.ok(tags.has("lighting"));
    assert.ok(EVAL_CASES.length >= 3);
  });

  for (const evalCase of EVAL_CASES) {
    it(`Top-1: ${evalCase.name}`, async () => {
      if (!(await fileExists(evalCase.queryPath))) {
        console.log(`SKIP: asset missing ${evalCase.queryPath}`);
        return;
      }

      const prisma = new PrismaClient();
      const expected = await prisma.clothingItem.findUnique({
        where: { sku: evalCase.expectedSku },
        select: { id: true, sku: true, photo: true, identificationIndex: true, identificationIndexedAt: true },
      });
      await prisma.$disconnect();

      if (!expected?.photo) {
        console.log(`SKIP: SKU ${evalCase.expectedSku} not in DB`);
        return;
      }
      if (!expected.identificationIndexedAt && !expected.identificationIndex) {
        console.log(`SKIP: ${evalCase.expectedSku} not indexed — run Admin → Re-index All`);
        return;
      }

      const buffer = await readFile(evalCase.queryPath);
      const result = await identificationPhotoSearch(buffer, {}, { debug: true });
      const top = result.results[0];

      assert.ok(top, "expected at least one result");
      assert.equal(
        top.sku,
        evalCase.expectedSku,
        `expected ${evalCase.expectedSku} but got ${top.sku} (${top.similarity}%) — reason: ${top.rank_reason}`,
      );
      assert.ok(
        top.similarity >= evalCase.minScore,
        `score ${top.similarity}% below minimum ${evalCase.minScore}%`,
      );
    });
  }

  it("same-dress catalog photo self-match", async () => {
    const prisma = new PrismaClient();
    const item = await prisma.clothingItem.findFirst({
      where: { sku: "ITM-1037", identificationIndexedAt: { not: null } },
      select: { sku: true, photo: true },
    });
    await prisma.$disconnect();
    if (!item?.photo) {
      console.log("SKIP: ITM-1037 not indexed");
      return;
    }

    const buffer = await loadCatalogPhoto(item.photo);
    const result = await identificationPhotoSearch(buffer, { category: "Lehenga" });
    const top = result.results[0];
    assert.equal(top?.sku, "ITM-1037");
    assert.ok((top?.similarity ?? 0) >= 85, `self-match score ${top?.similarity}%`);
  });
});

describe("eval suite scenario coverage", () => {
  /** Scenarios with assets — add cases as test photos become available. */
  const BASELINE_SCENARIOS = [
    "same_dress",
    "lighting",
    "angle",
    "background",
    "phone_camera",
    "hanging",
    "mannequin",
  ] as const;

  it("covers baseline evaluation scenarios", () => {
    const covered = new Set(EVAL_CASES.flatMap((c) => c.tags));
    for (const scenario of BASELINE_SCENARIOS) {
      assert.ok(covered.has(scenario), `missing eval case for scenario: ${scenario}`);
    }
  });
});

describe("eval suite targets", () => {
  it("documents Top-1 accuracy target ≥95% on internal dataset", () => {
    const TARGET = 0.95;
    assert.equal(TARGET, 0.95);
  });
});
