const { PrismaClient } = require("@prisma/client");
const { existsSync, statSync } = require("fs");
const { join } = require("path");

const p = new PrismaClient();

function fmt(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function mediaBytes(ref) {
  const raw = (ref || "").trim();
  if (!raw) return null;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      let res = await fetch(raw, { method: "HEAD", signal: controller.signal, cache: "no-store" });
      let n = Number(res.headers.get("content-length"));
      if ((!res.ok || !Number.isFinite(n)) && res.status !== 405) {
        // Some CDNs dislike HEAD — try ranged GET
        res = await fetch(raw, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          signal: controller.signal,
          cache: "no-store",
        });
        const range = res.headers.get("content-range");
        const m = range && /\/(\d+)\s*$/.exec(range);
        if (m) n = Number(m[1]);
        else n = Number(res.headers.get("content-length"));
      }
      return Number.isFinite(n) && n >= 0 ? n : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const relative = raw.replace(/^\/+/, "").replace(/^uploads\//, "uploads/");
  const candidates = [
    join(process.cwd(), "public", relative.startsWith("uploads/") ? relative : join("uploads", relative)),
    join(process.cwd(), "public", "uploads", relative),
    join(process.cwd(), "public", relative),
  ];
  for (const absolute of candidates) {
    if (existsSync(absolute)) {
      try {
        return statSync(absolute).size;
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return out;
}

async function main() {
  const dbInfo = await p.$queryRawUnsafe(`
    SELECT current_database() AS db, COALESCE(inet_server_addr()::text, 'n/a') AS host
  `);

  const count = await p.clothingItem.count();
  const tables = await p.$queryRawUnsafe(`
    SELECT c.relname AS name,
      pg_total_relation_size(c.oid)::bigint AS total,
      pg_relation_size(c.oid)::bigint AS heap,
      CASE WHEN c.reltoastrelid = 0 THEN 0 ELSE pg_total_relation_size(c.reltoastrelid) END::bigint AS toast,
      COALESCE(s.n_live_tup, 0)::bigint AS live_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (
        c.relname LIKE 'clothing%'
        OR c.relname LIKE 'inventory%'
      )
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);

  const dbSize = await p.$queryRawUnsafe(`
    SELECT pg_database_size(current_database())::bigint AS db_bytes
  `);

  const items = await p.clothingItem.findMany({
    select: {
      id: true,
      name: true,
      photo: true,
      thumbnailPhoto: true,
      originalPhoto: true,
      enhancedPhoto: true,
      marketingPhoto: true,
      recognitionImage: true,
    },
  });

  let refPhotos = [];
  try {
    refPhotos = await p.clothingItemReferencePhoto.findMany({
      select: { itemId: true, photo: true },
    });
  } catch {
    refPhotos = [];
  }

  const urlSet = new Set();
  for (const it of items) {
    for (const u of [
      it.photo,
      it.thumbnailPhoto,
      it.originalPhoto,
      it.enhancedPhoto,
      it.marketingPhoto,
      it.recognitionImage,
    ]) {
      if (u && String(u).trim()) urlSet.add(String(u).trim());
    }
  }
  for (const rp of refPhotos) {
    if (rp.photo && String(rp.photo).trim()) urlSet.add(String(rp.photo).trim());
  }
  const urls = [...urlSet];

  const sizes = await mapPool(urls, 16, async (url) => ({ url, bytes: await mediaBytes(url) }));
  const known = sizes.filter((s) => s.bytes != null);
  const blobTotal = known.reduce((a, s) => a + s.bytes, 0);
  const sizeMap = new Map(sizes.map((s) => [s.url, s.bytes]));

  const perItem = items.map((it) => {
    const set = new Set(
      [
        it.photo,
        it.thumbnailPhoto,
        it.originalPhoto,
        it.enhancedPhoto,
        it.marketingPhoto,
        it.recognitionImage,
      ]
        .filter(Boolean)
        .map((u) => String(u).trim()),
    );
    let bytes = 0;
    let missing = 0;
    for (const u of set) {
      const b = sizeMap.get(u);
      if (b != null) bytes += b;
      else if (u) missing += 1;
    }
    return { id: it.id, name: it.name, bytes, missing, urls: set.size };
  });

  const withMeasured = perItem.filter((x) => x.bytes > 0);
  const avgItemPhoto = withMeasured.length
    ? withMeasured.reduce((a, x) => a + x.bytes, 0) / withMeasured.length
    : 0;

  const tableRows = tables.map((r) => ({
    name: r.name,
    total: Number(r.total),
    heap: Number(r.heap),
    toast: Number(r.toast),
    live_rows: Number(r.live_rows),
  }));
  const inventoryDbTotal = tableRows.reduce((a, r) => a + r.total, 0);

  const httpUrls = urls.filter((u) => /^https?:\/\//i.test(u)).length;
  const localUrls = urls.length - httpUrls;

  console.log(
    JSON.stringify(
      {
        dbInfo: dbInfo[0],
        count,
        withPhoto: perItem.filter((x) => x.urls > 0).length,
        refPhotoRows: refPhotos.length,
        db_bytes: Number(dbSize[0].db_bytes),
        inventory_db_total_bytes: inventoryDbTotal,
        inventory_db_tables: tableRows.slice(0, 12),
        media: {
          unique_paths: urls.length,
          http_urls: httpUrls,
          local_paths: localUrls,
          measured: known.length,
          unknown: urls.length - known.length,
          total_bytes: blobTotal,
          avg_per_item_with_photos: avgItemPhoto,
        },
        totals: {
          photos_fmt: fmt(blobTotal),
          inventory_db_fmt: fmt(inventoryDbTotal),
          combined_fmt: fmt(blobTotal + inventoryDbTotal),
          avg_photo_per_item_fmt: fmt(avgItemPhoto),
        },
        largest_items: [...perItem]
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 10)
          .map((x) => ({
            id: x.id,
            name: x.name,
            size: fmt(x.bytes),
            bytes: x.bytes,
            missing: x.missing,
          })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
