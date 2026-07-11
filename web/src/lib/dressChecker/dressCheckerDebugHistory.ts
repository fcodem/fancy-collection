/**
 * Persist last N dress-checker debug searches for admin diagnostics.
 * File-backed (dev-friendly); not a substitute for durable analytics.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export const DRESS_CHECKER_DEBUG_HISTORY_LIMIT = 100;

export type DressCheckerDebugQueryDetected = {
  category: string;
  colours: {
    primary: string;
    secondary: string;
    accents: string[];
    family: string;
    label: string;
  };
  motifs: string[];
  embroideryDensity: number;
  embroideryStyle: string;
  embroideryLabel: string;
};

export type DressCheckerDebugCandidate = {
  rank: number;
  itemId: number;
  sku: string;
  name: string;
  photo: string;
  category: string;
  embeddingScore: number;
  colourScore: number;
  borderScore: number;
  motifScore: number;
  stoneScore: number;
  textureScore: number | null;
  identityScore: number | null;
  openAiScore: number;
  finalScore: number;
  rejected: boolean;
  rejectReason?: string;
  reasons: string[];
  rankReason: string;
  openAiVerification: {
    exactMatch: boolean;
    confidence: number;
    reasoning: string;
    reasons?: string[];
  } | null;
};

export type DressCheckerDebugPayload = {
  processing_time_ms: number;
  identification_meta: {
    decision: string;
    confidence: number;
    message: string;
    reasoning: string;
  };
  best_similarity: number;
  query_detected: DressCheckerDebugQueryDetected;
  candidates: DressCheckerDebugCandidate[];
  rejected_candidates: DressCheckerDebugCandidate[];
  ai_diagnostics?: Record<string, unknown>;
};

export type DressCheckerDebugHistoryEntry = {
  id: string;
  createdAt: string;
  categoryHint: string;
  processingTimeMs: number;
  decision: string;
  confidence: number;
  topSku: string | null;
  topName: string | null;
  candidateCount: number;
  rejectedCount: number;
  queryDetected: DressCheckerDebugQueryDetected;
  payload: DressCheckerDebugPayload;
};

type HistoryFile = {
  version: 1;
  entries: DressCheckerDebugHistoryEntry[];
};

function historyPath(): string {
  return join(process.cwd(), ".data", "dress-checker-debug-history.json");
}

async function readHistoryFile(): Promise<HistoryFile> {
  try {
    const raw = await readFile(historyPath(), "utf8");
    const parsed = JSON.parse(raw) as HistoryFile;
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return { version: 1, entries: parsed.entries };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeHistoryFile(file: HistoryFile): Promise<void> {
  const dir = join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await writeFile(historyPath(), JSON.stringify(file, null, 2), "utf8");
}

export async function listDressCheckerDebugHistory(
  limit = DRESS_CHECKER_DEBUG_HISTORY_LIMIT,
): Promise<Array<Omit<DressCheckerDebugHistoryEntry, "payload">>> {
  const file = await readHistoryFile();
  return file.entries.slice(0, limit).map(({ payload: _p, ...meta }) => meta);
}

export async function getDressCheckerDebugHistoryEntry(
  id: string,
): Promise<DressCheckerDebugHistoryEntry | null> {
  const file = await readHistoryFile();
  return file.entries.find((e) => e.id === id) ?? null;
}

export async function appendDressCheckerDebugHistory(input: {
  categoryHint: string;
  payload: DressCheckerDebugPayload;
}): Promise<DressCheckerDebugHistoryEntry> {
  const top = input.payload.candidates.find((c) => !c.rejected) ?? input.payload.candidates[0];
  const entry: DressCheckerDebugHistoryEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    categoryHint: input.categoryHint,
    processingTimeMs: input.payload.processing_time_ms,
    decision: input.payload.identification_meta.decision,
    confidence: input.payload.identification_meta.confidence,
    topSku: top?.sku ?? null,
    topName: top?.name ?? null,
    candidateCount: input.payload.candidates.length,
    rejectedCount: input.payload.rejected_candidates.length,
    queryDetected: input.payload.query_detected,
    payload: input.payload,
  };

  const file = await readHistoryFile();
  file.entries = [entry, ...file.entries].slice(0, DRESS_CHECKER_DEBUG_HISTORY_LIMIT);
  await writeHistoryFile(file);
  return entry;
}
