/** Safe DB pooler diagnostics — never logs passwords or full URLs. */
export function logSafeDatabaseConfig(label = "db-config") {
  try {
    const url = process.env.DATABASE_URL?.trim() || "";
    const pooler = /pooler\.supabase\.com/i.test(url) || /pgbouncer=true/i.test(url);
    const portMatch = url.match(/:(\d+)\//) || url.match(/:(\d+)\?/);
    const port = portMatch ? portMatch[1] : "unknown";
    const limitMatch = url.match(/connection_limit=(\d+)/i);
    const connectionLimit = limitMatch ? Number(limitMatch[1]) : null;
    const region = process.env.VERCEL_REGION || process.env.AWS_REGION || "local";
    console.log(
      `[${label}] poolerDetected=${pooler} port=${port} connectionLimit=${connectionLimit ?? "unset"} vercelRegion=${region}`,
    );
  } catch {
    /* ignore */
  }
}
