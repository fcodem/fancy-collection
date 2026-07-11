import { isResponse, jsonOk, requireOwner } from "@/lib/api";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const [enhanced, pending, failed, latencyRows] = await Promise.all([
    prisma.clothingItem.count({ where: { enhancementStatus: "completed", enhancedPhoto: { not: null } } }),
    prisma.clothingItem.count({ where: { enhancementStatus: "processing" } }),
    prisma.clothingItem.count({ where: { enhancementStatus: "failed" } }),
    prisma.inventoryAiProfile.findMany({
      where: { enhancementStatus: "completed", enhancementLatencyMs: { not: null } },
      select: { enhancementLatencyMs: true },
      take: 500,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const latencies = latencyRows
    .map((row) => row.enhancementLatencyMs || 0)
    .filter((value) => Number.isFinite(value) && value > 0);
  const avgMs = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : 0;
  const totalRuns = enhanced + failed;
  const successRate = totalRuns > 0 ? Math.round((enhanced / totalRuns) * 10000) / 100 : 0;
  const estimatedCostUsd = Math.round((totalRuns * 0.01 + (totalRuns / 1000) * 0.13) * 100) / 100;

  return jsonOk({
    ok: true,
    metrics: {
      imagesEnhanced: enhanced,
      pending,
      failed,
      averageProcessingTimeMs: avgMs,
      successRate,
      apiUsageCalls: totalRuns,
      estimatedCostUsd,
    },
  });
}
