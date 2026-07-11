import prisma from "@/lib/prisma";
import {
  countIndexedPgvectorEmbeddings,
  getDressCheckerIndexStats,
  isPgvectorAvailable,
} from "@/lib/ai/pgvector";
import { isVlmAvailable } from "@/lib/dressChecker/vlmIdentity";
import { resolveOpenAiKey } from "@/lib/ai/aiRuntimeSettings";
import type { DressCheckerIssueCode } from "@/lib/dressChecker/issueCodes";

export type { DressCheckerIssueCode } from "@/lib/dressChecker/issueCodes";

export type DressCheckerHealthIssue = {
  code: DressCheckerIssueCode;
  severity: "critical" | "warning" | "info";
  message: string;
  remediation: string;
};

export type DressCheckerSearchHealth = {
  ok: boolean;
  pgvector: boolean;
  openaiVerificationEnabled: boolean;
  openaiKeyConfigured: boolean;
  inventoryWithPhoto: number;
  aiProfiles: number;
  pgvectorEmbeddings: number;
  issues: DressCheckerHealthIssue[];
  checkedAt: string;
};

export function classifyVectorFailureCode(
  reason: string,
  category?: string,
): DressCheckerIssueCode {
  const r = reason.toLowerCase();
  if (r.includes("pgvector is not available") || r.includes("extension")) {
    return "PGVECTOR_MISSING";
  }
  if (r.includes("query embedding is empty")) {
    return "QUERY_EMBEDDING_FAILED";
  }
  if (r.includes("no inventory items have pgvector embeddings")) {
    return category ? "EMBEDDINGS_MISSING_CATEGORY" : "EMBEDDINGS_MISSING";
  }
  if (r.includes("returned 0 candidates")) {
    return "VECTOR_SEARCH_EMPTY";
  }
  return "VECTOR_SEARCH_FAILED";
}

export type SearchDegradation = {
  degraded: true;
  from_engine: "pgvector";
  to_engine: "hash";
  code: DressCheckerIssueCode;
  reason: string;
  occurred_at: string;
  vector_diagnostics?: Record<string, unknown>;
};

export function buildSearchDegradation(
  reason: string,
  diagnostics: Record<string, unknown> = {},
  category?: string,
): SearchDegradation {
  return {
    degraded: true,
    from_engine: "pgvector",
    to_engine: "hash",
    code: classifyVectorFailureCode(reason, category),
    reason,
    occurred_at: new Date().toISOString(),
    vector_diagnostics: diagnostics,
  };
}

export function logSearchDegradation(degradation: SearchDegradation): void {
  console.error("[DressSearch] ===== SEARCH DEGRADED (hash fallback) =====");
  console.error(`[DressSearch] code=${degradation.code}`);
  console.error(`[DressSearch] reason=${degradation.reason}`);
  console.error(`[DressSearch] from=${degradation.from_engine} to=${degradation.to_engine}`);
  if (degradation.vector_diagnostics && Object.keys(degradation.vector_diagnostics).length) {
    console.error("[DressSearch] vector_diagnostics:", degradation.vector_diagnostics);
  }
  console.error("[DressSearch] ===========================================");
}

export { remediationForIssueCode } from "@/lib/dressChecker/issueRemediation";

async function checkOpenAiKey(): Promise<boolean> {
  if (!isVlmAvailable()) return false;
  try {
    const key = await resolveOpenAiKey();
    return !!key?.trim();
  } catch {
    return false;
  }
}

/** Pre-flight health for Dress Checker search (admin + diagnostics). */
export async function getDressCheckerSearchHealth(): Promise<DressCheckerSearchHealth> {
  const pgvector = await isPgvectorAvailable();
  const stats = await getDressCheckerIndexStats();
  const inventoryWithPhoto = await prisma.clothingItem.count({
    where: { photo: { not: null }, NOT: { photo: "" } },
  });
  const pgvectorEmbeddings = pgvector ? await countIndexedPgvectorEmbeddings() : 0;
  const openaiVerificationEnabled = isVlmAvailable();
  const openaiKeyConfigured = await checkOpenAiKey();

  const issues: DressCheckerHealthIssue[] = [];

  if (!pgvector) {
    issues.push({
      code: "PGVECTOR_MISSING",
      severity: "critical",
      message: "pgvector extension or embedding_vector column is not available",
      remediation:
        "Install pgvector on PostgreSQL and run: npx prisma migrate deploy. Photo search will use hash fallback until fixed.",
    });
  }

  if (inventoryWithPhoto > 0 && stats.totalProfiles === 0) {
    issues.push({
      code: "AI_PROFILES_MISSING",
      severity: "critical",
      message: `No inventory_ai_profiles rows (${inventoryWithPhoto} items have photos)`,
      remediation: "Run: npx tsx scripts/reindex-all-inventory.ts",
    });
  } else if (inventoryWithPhoto > 0 && pgvectorEmbeddings < inventoryWithPhoto) {
    issues.push({
      code: "AI_PROFILES_INCOMPLETE",
      severity: "warning",
      message: `Only ${pgvectorEmbeddings}/${inventoryWithPhoto} items have pgvector embeddings`,
      remediation: "Run bulk reindex from /admin/ai-debug or scripts/reindex-all-inventory.ts",
    });
  }

  if (pgvector && pgvectorEmbeddings === 0 && inventoryWithPhoto > 0) {
    issues.push({
      code: "EMBEDDINGS_MISSING",
      severity: "critical",
      message: "No pgvector embeddings indexed — vector search cannot run",
      remediation: "Run: npx tsx scripts/reindex-all-inventory.ts",
    });
  }

  if (!openaiVerificationEnabled) {
    issues.push({
      code: "OPENAI_UNAVAILABLE",
      severity: "info",
      message: "OpenAI verification is disabled (DRESS_CHECKER_VLM=0)",
      remediation: "Remove DRESS_CHECKER_VLM=0 to enable final Image A vs B verification",
    });
  } else if (!openaiKeyConfigured) {
    issues.push({
      code: "OPENAI_KEY_MISSING",
      severity: "warning",
      message: "OpenAI API key is not configured — verification stage will be skipped",
      remediation: "Set OPENAI_API_KEY in .env or configure in Admin → AI Settings",
    });
  }

  const critical = issues.filter((i) => i.severity === "critical").length;

  return {
    ok: critical === 0,
    pgvector,
    openaiVerificationEnabled,
    openaiKeyConfigured,
    inventoryWithPhoto,
    aiProfiles: stats.totalProfiles,
    pgvectorEmbeddings,
    issues,
    checkedAt: new Date().toISOString(),
  };
}
