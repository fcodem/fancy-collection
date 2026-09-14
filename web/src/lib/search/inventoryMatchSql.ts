/**
 * Shared Postgres SQL fragment for inventory name/SKU/color search.
 * Same rules as booking availability name search.
 */
import { Prisma } from "@prisma/client";
import { parseSearchQuery } from "@/lib/search/textMatch";

/**
 * @param search user query
 * @param col prefix for columns, e.g. "ci." or "" for bare clothing_items columns
 */
export function inventoryMatchSql(search: string, col = "ci."): Prisma.Sql {
  const { trimmed, compact, words } = parseSearchQuery(search);
  if (!trimmed) return Prisma.sql`TRUE`;

  const name = Prisma.raw(`${col}name`);
  const sku = Prisma.raw(`${col}sku`);
  const color = Prisma.raw(`${col}color`);
  const notes = Prisma.raw(`${col}condition_notes`);

  const phrase = Prisma.sql`(
    ${name} ILIKE ${`%${trimmed}%`}
    OR ${sku} = ${trimmed}
    OR COALESCE(${color}, '') ILIKE ${`%${trimmed}%`}
    OR COALESCE(${notes}, '') ILIKE ${`%${trimmed}%`}
    OR (
      ${compact} <> ''
      AND regexp_replace(lower(${name}), '[^a-z0-9]', '', 'g') LIKE ${`%${compact}%`}
    )
    OR (
      ${compact} <> ''
      AND regexp_replace(lower(${sku}), '[^a-z0-9]', '', 'g') LIKE ${`%${compact}%`}
    )
    OR (
      ${compact} <> ''
      AND regexp_replace(lower(${name} || ' ' || COALESCE(${color}, '')), '[^a-z0-9]', '', 'g') LIKE ${`%${compact}%`}
    )
  )`;

  if (words.length <= 1) return phrase;

  const wordClauses = words.map((word) => {
    const wordCompact = word.toLowerCase().replace(/[^a-z0-9]/g, "");
    return Prisma.sql`(
      ${name} ILIKE ${`%${word}%`}
      OR COALESCE(${color}, '') ILIKE ${`%${word}%`}
      OR ${sku} ILIKE ${`%${word}%`}
      OR COALESCE(${notes}, '') ILIKE ${`%${word}%`}
      OR (
        ${wordCompact} <> ''
        AND regexp_replace(lower(${name}), '[^a-z0-9]', '', 'g') LIKE ${`%${wordCompact}%`}
      )
      OR (
        ${wordCompact} <> ''
        AND regexp_replace(lower(COALESCE(${color}, '')), '[^a-z0-9]', '', 'g') LIKE ${`%${wordCompact}%`}
      )
      OR (
        ${wordCompact} <> ''
        AND regexp_replace(lower(${sku}), '[^a-z0-9]', '', 'g') LIKE ${`%${wordCompact}%`}
      )
    )`;
  });

  return Prisma.sql`(${phrase} OR (${Prisma.join(wordClauses, " AND ")}))`;
}
