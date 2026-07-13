/**
 * Ensure DIRECT_URL is set for Prisma (schema requires env("DIRECT_URL")).
 * Derives Session-pooler :5432 from Transaction DATABASE_URL :6543 when unset.
 * Mutates process.env — call from the same Node process that runs prisma.
 */
export function deriveDirectUrl(databaseUrl) {
  let direct = databaseUrl.replace(/:6543\b/g, ":5432");
  direct = direct
    .replace(/([?&])pgbouncer=true&?/gi, "$1")
    .replace(/([?&])connection_limit=\d+&?/gi, "$1")
    .replace(/\?&/g, "?")
    .replace(/[?&]$/g, "")
    .replace(/\?$/g, "");
  if (!/[?&]sslmode=/i.test(direct)) {
    direct += (direct.includes("?") ? "&" : "?") + "sslmode=require";
  }
  return direct;
}

export function ensureDirectUrl({ label = "ensure-direct-url", exitOnMissing = true } = {}) {
  if (process.env.DIRECT_URL?.trim()) {
    return { source: "env", url: process.env.DIRECT_URL.trim() };
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    if (exitOnMissing) {
      console.error(`[${label}] DATABASE_URL is missing (required to derive DIRECT_URL)`);
      process.exit(1);
    }
    return { source: "missing", url: "" };
  }
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    if (exitOnMissing) {
      console.error(
        `[${label}] DATABASE_URL must start with postgresql:// — check Vercel env (no quotes, no DATABASE_URL= prefix)`,
      );
      process.exit(1);
    }
    return { source: "invalid", url: "" };
  }
  if (/@db\.[a-z0-9]+\.supabase\.co:/i.test(databaseUrl)) {
    console.warn(
      `[${label}] DATABASE_URL uses direct db.*.supabase.co — Vercel often fails (P1001). Use pooler.supabase.com:6543 instead.`,
    );
  }
  process.env.DIRECT_URL = deriveDirectUrl(databaseUrl);
  console.log(`[${label}] derived DIRECT_URL from DATABASE_URL (Session pooler :5432)`);
  return { source: "derived", url: process.env.DIRECT_URL };
}
