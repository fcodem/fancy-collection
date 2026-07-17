/** Safe DB pooler diagnostics — never logs passwords or full URLs. */

/** Effective limit after prisma.ts normalization (remote prod forces 3). */
export function getEffectiveConnectionLimit(): number | null {
  const url = process.env.DATABASE_URL?.trim() || "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "";
    const isRemoteProd =
      process.env.VERCEL === "1" ||
      process.env.NODE_ENV === "production" ||
      /pooler\.supabase\.com$/i.test(host) ||
      /\.supabase\.co$/i.test(host);
    if (isRemoteProd) return 3;
    const fromUrl = parsed.searchParams.get("connection_limit");
    return fromUrl ? Number(fromUrl) : null;
  } catch {
    const m = url.match(/connection_limit=(\d+)/i);
    return m ? Number(m[1]) : null;
  }
}

export function logSafeDatabaseConfig(label = "db-config") {
  try {
    const url = process.env.DATABASE_URL?.trim() || "";
    const pooler = /pooler\.supabase\.com/i.test(url) || /pgbouncer=true/i.test(url);
    const portMatch = url.match(/:(\d+)\//) || url.match(/:(\d+)\?/);
    const port = portMatch ? portMatch[1] : "unknown";
    const rawMatch = url.match(/connection_limit=(\d+)/i);
    const rawConnectionLimit = rawMatch ? Number(rawMatch[1]) : null;
    const effectiveConnectionLimit = getEffectiveConnectionLimit();
    const region = process.env.VERCEL_REGION || process.env.AWS_REGION || "local";
    console.log(
      `[${label}] poolerDetected=${pooler} port=${port} connectionLimitRaw=${rawConnectionLimit ?? "unset"} connectionLimitEffective=${effectiveConnectionLimit ?? "unset"} vercelRegion=${region}`,
    );
  } catch {
    /* ignore */
  }
}
