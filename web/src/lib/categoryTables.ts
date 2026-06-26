import prisma from "./prisma";
import { SUB_CATEGORIES } from "./constants";

export type SubCategoryRow = {
  id: number;
  name: string;
  active: boolean;
  createdAt: Date;
};

type PrismaDelegate = {
  findMany?: (args: unknown) => Promise<unknown>;
  findUnique?: (args: unknown) => Promise<unknown>;
  findFirst?: (args: unknown) => Promise<unknown>;
  create?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
};

function delegate(name: "customSubCategory" | "hiddenCategory"): PrismaDelegate | undefined {
  return (prisma as unknown as Record<string, PrismaDelegate | undefined>)[name];
}

export async function findActiveSubCategoryNames(): Promise<string[]> {
  const model = delegate("customSubCategory");
  if (model?.findMany) {
    const rows = (await model.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    })) as { name: string }[];
    if (rows.length) return rows.map((r) => r.name);
    return [...SUB_CATEGORIES];
  }
  try {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM custom_sub_categories WHERE active = true ORDER BY name ASC
    `;
    if (rows.length) return rows.map((r) => r.name);
  } catch {
    /* table missing or stale client */
  }
  return [...SUB_CATEGORIES];
}

export async function findActiveSubCategories(): Promise<SubCategoryRow[]> {
  const model = delegate("customSubCategory");
  if (model?.findMany) {
    return (await model.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    })) as SubCategoryRow[];
  }
  try {
    return await prisma.$queryRaw<SubCategoryRow[]>`
      SELECT id, name, active, created_at AS "createdAt"
      FROM custom_sub_categories
      WHERE active = true
      ORDER BY name ASC
    `;
  } catch {
    return SUB_CATEGORIES.map((name, i) => ({
      id: i + 1,
      name,
      active: true,
      createdAt: new Date(),
    }));
  }
}

export async function findHiddenCategoryNames(): Promise<string[]> {
  const model = delegate("hiddenCategory");
  if (model?.findMany) {
    const rows = (await model.findMany()) as { name: string }[];
    return rows.map((r) => r.name);
  }
  try {
    const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM hidden_categories`;
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

export async function hideCategoryName(name: string): Promise<void> {
  const trimmed = name.trim();
  const model = delegate("hiddenCategory");
  if (model?.findUnique && model?.create) {
    const existing = (await model.findUnique({ where: { name: trimmed } })) as { id: number } | null;
    if (!existing) await model.create({ data: { name: trimmed } });
    return;
  }
  await prisma.$executeRaw`
    INSERT INTO hidden_categories (name) VALUES (${trimmed})
    ON CONFLICT (name) DO NOTHING
  `;
}

export async function addSubCategoryRow(name: string): Promise<SubCategoryRow> {
  const trimmed = name.trim();
  const model = delegate("customSubCategory");
  if (model?.findUnique && model?.create && model?.update) {
    const existing = (await model.findUnique({ where: { name: trimmed } })) as SubCategoryRow | null;
    if (existing) {
      if (!existing.active) {
        return (await model.update({ where: { id: existing.id }, data: { active: true } })) as SubCategoryRow;
      }
      throw new Error("Sub-category already exists.");
    }
    return (await model.create({ data: { name: trimmed } })) as SubCategoryRow;
  }
  const rows = await prisma.$queryRaw<{ id: number; active: boolean }[]>`
    SELECT id, active FROM custom_sub_categories WHERE name = ${trimmed} LIMIT 1
  `;
  if (rows[0]) {
    if (!rows[0].active) {
      const updated = await prisma.$queryRaw<SubCategoryRow[]>`
        UPDATE custom_sub_categories SET active = true WHERE id = ${rows[0].id}
        RETURNING id, name, active, created_at AS "createdAt"
      `;
      if (!updated[0]) throw new Error("Sub-category not found.");
      return updated[0];
    }
    throw new Error("Sub-category already exists.");
  }
  const inserted = await prisma.$queryRaw<SubCategoryRow[]>`
    INSERT INTO custom_sub_categories (name, active)
    VALUES (${trimmed}, true)
    RETURNING id, name, active, created_at AS "createdAt"
  `;
  if (!inserted[0]) throw new Error("Failed to add sub-category.");
  return inserted[0];
}

export async function updateSubCategoryRow(id: number, name: string): Promise<SubCategoryRow> {
  const trimmed = name.trim();
  const model = delegate("customSubCategory");
  if (model?.findFirst && model?.update) {
    const conflict = (await model.findFirst({
      where: { name: trimmed, active: true, NOT: { id } },
    })) as SubCategoryRow | null;
    if (conflict) throw new Error("Sub-category already exists.");
    return (await model.update({ where: { id }, data: { name: trimmed } })) as SubCategoryRow;
  }
  const conflict = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM custom_sub_categories WHERE name = ${trimmed} AND active = true AND id <> ${id} LIMIT 1
  `;
  if (conflict.length) throw new Error("Sub-category already exists.");
  const rows = await prisma.$queryRaw<SubCategoryRow[]>`
    UPDATE custom_sub_categories SET name = ${trimmed} WHERE id = ${id}
    RETURNING id, name, active, created_at AS "createdAt"
  `;
  if (!rows[0]) throw new Error("Sub-category not found.");
  return rows[0];
}

export async function removeSubCategoryRow(id: number): Promise<void> {
  const model = delegate("customSubCategory");
  if (model?.update) {
    await model.update({ where: { id }, data: { active: false } });
    return;
  }
  await prisma.$executeRaw`UPDATE custom_sub_categories SET active = false WHERE id = ${id}`;
}
