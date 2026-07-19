import prisma from "@/lib/prisma";
import { jsonOk, requireUser, isResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Lightweight AI queue stats — loaded client-side so dashboard SSR does not compete for DB pool slots. */
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const rows = await prisma.$queryRaw<Array<{ queued: number; failed: number }>>`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS queued,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM inventory_ai_jobs
  `;
  return jsonOk(rows[0] ?? { queued: 0, failed: 0 });
}
