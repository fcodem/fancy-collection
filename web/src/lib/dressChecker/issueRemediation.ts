import type { DressCheckerIssueCode } from "@/lib/dressChecker/issueCodes";

const ISSUE_REMEDIATION: Record<DressCheckerIssueCode, string> = {
  PGVECTOR_MISSING:
    "Install pgvector on PostgreSQL and run: npx prisma migrate deploy",
  EMBEDDINGS_MISSING: "Run: npx tsx scripts/reindex-all-inventory.ts",
  EMBEDDINGS_MISSING_CATEGORY:
    "Reindex items in this category: npx tsx scripts/reindex-all-inventory.ts",
  AI_PROFILES_MISSING: "Run: npx tsx scripts/reindex-all-inventory.ts",
  AI_PROFILES_INCOMPLETE:
    "Bulk reindex from /admin/ai-debug or scripts/reindex-all-inventory.ts",
  OPENAI_UNAVAILABLE:
    "Remove DRESS_CHECKER_VLM=0 to enable final Image A vs B verification",
  OPENAI_KEY_MISSING:
    "Set OPENAI_API_KEY in .env or configure in Admin → AI Settings",
  QUERY_EMBEDDING_FAILED:
    "Check IMAGE_EMBEDDING_MODELS and embedding service logs; retry the search",
  VECTOR_SEARCH_EMPTY:
    "No vector matches — verify embeddings exist and category filter is correct",
  VECTOR_SEARCH_FAILED:
    "Check server logs for pgvector errors; verify extension and indexes",
  SEARCH_DEGRADED_HASH:
    "Fix the underlying pgvector issue — hash fallback is degraded mode only",
  UNEXPECTED_SEARCH_ERROR: "Check server logs for the full stack trace",
};

export function remediationForIssueCode(code: DressCheckerIssueCode | string): string {
  return ISSUE_REMEDIATION[code as DressCheckerIssueCode] ?? ISSUE_REMEDIATION.UNEXPECTED_SEARCH_ERROR;
}
