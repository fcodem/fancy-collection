/**
 * Normalize DB env vars for Vercel + Supabase.
 * Supabase's Vercel integration often sets POSTGRES_* instead of DATABASE_URL / DIRECT_URL.
 * Mutates process.env early so Prisma schema env() and runtime client agree.
 */
export function applySupabaseEnvAliases({ label = "db-env" } = {}) {
  const pick = (...keys) => {
    for (const key of keys) {
      const v = process.env[key]?.trim();
      if (v) return v;
    }
    return "";
  };

  if (!process.env.DATABASE_URL?.trim()) {
    const fromIntegration = pick(
      "POSTGRES_PRISMA_URL",
      "POSTGRES_URL",
      "DATABASE_URL",
    );
    if (fromIntegration) {
      process.env.DATABASE_URL = fromIntegration;
      console.log(`[${label}] mapped DATABASE_URL from Vercel/Supabase integration env`);
    }
  }

  if (!process.env.DIRECT_URL?.trim()) {
    const nonPooling = process.env.POSTGRES_URL_NON_POOLING?.trim();
    if (nonPooling) {
      process.env.DIRECT_URL = nonPooling;
      console.log(`[${label}] mapped DIRECT_URL from POSTGRES_URL_NON_POOLING`);
    }
  }

  return {
    databaseUrl: process.env.DATABASE_URL?.trim() || "",
    directUrl: process.env.DIRECT_URL?.trim() || "",
  };
}
