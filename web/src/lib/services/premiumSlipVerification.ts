import "server-only";

import prisma from "@/lib/prisma";
import { normalizeIndianPhone } from "@/lib/phone";
import {
  PREMIUM_SLIP_TEMPLATE_VERSION,
  assertPremiumSlipPdf,
} from "@/lib/premiumSlip";
import {
  PREMIUM_SLIP_ROOT_ID,
  PREMIUM_SLIP_REQUIRED_SECTIONS,
} from "@/lib/premiumSlipHtmlValidation";
import type { PremiumSlipKind } from "@/lib/premiumSlip";
import {
  generateBookingSlipPdf,
  generateDeliverySlipPdf,
  generateReturnSlipPdf,
  generateIncompleteSlipPdf,
} from "./whatsapp/slipPdf";
import type { SlipPdfKind } from "./whatsapp/slipHtmlPdf.server";
import {
  uploadWhatsAppMedia,
  sendWhatsAppDocumentByMediaId,
  isWhatsAppConfigured,
} from "./whatsapp/metaApi";

export type PremiumSlipTestKind = SlipPdfKind;

export type PremiumSlipRenderTestResult = {
  kind: PremiumSlipTestKind;
  ok: boolean;
  templateVersion: string;
  pdfSizeBytes: number;
  pageCount: number;
  totalMs: number;
  failureStage?: string;
  retryable?: boolean;
  error?: string;
  downloadToken?: string;
  rootId: string;
  requiredSections: readonly string[];
  sectionsValidated: boolean;
};

export type PremiumSlipSendTestResult = {
  ok: boolean;
  metaRequestStarted: boolean;
  messageId?: string;
  method: "freeform_document" | "none";
  recipientMasked: string;
  sentAt?: string;
  error?: string;
};

export type PremiumSlipTestRunResult = {
  runId: string;
  bookingId: number;
  render: PremiumSlipRenderTestResult;
  send?: PremiumSlipSendTestResult;
};

const runs = new Map<
  string,
  {
    createdAt: number;
    bookingId: number;
    results: PremiumSlipTestRunResult[];
    pdfByToken: Map<string, { pdf: Buffer; kind: PremiumSlipTestKind; bookingId: number }>;
  }
>();

const RUN_TTL_MS = 30 * 60_000;

function purgeExpiredRuns(): void {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [id, run] of runs) {
    if (run.createdAt < cutoff) runs.delete(id);
  }
}

function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? 1;
}

function maskIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `******${digits.slice(-4)}`;
}

async function resolveTestBooking(bookingId?: number): Promise<number> {
  if (bookingId != null && bookingId > 0) {
    const found = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    });
    if (!found) throw new Error(`Booking #${bookingId} not found`);
    return found.id;
  }

  const synthetic = await prisma.booking.findFirst({
    where: {
      OR: [
        { customerName: { contains: "SLIP TEST", mode: "insensitive" } },
        { commonNotes: { contains: "AUTO SLIP TEST", mode: "insensitive" } },
      ],
    },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  if (!synthetic) {
    throw new Error(
      "No safe test booking found — create a SLIP TEST booking or pass bookingId explicitly.",
    );
  }
  return synthetic.id;
}

async function renderPremiumSlipForTest(
  kind: PremiumSlipTestKind,
  bookingId: number,
  requestOrigin: string,
): Promise<{ pdf: Buffer; totalMs: number }> {
  const started = Date.now();
  let pdf: Buffer | undefined;
  switch (kind) {
    case "booking":
      pdf = await generateBookingSlipPdf(bookingId, requestOrigin);
      break;
    case "delivery":
      pdf = await generateDeliverySlipPdf(bookingId, requestOrigin, { scope: "full" });
      break;
    case "return":
      pdf = await generateReturnSlipPdf(bookingId, requestOrigin, { scope: "full" });
      break;
    case "incomplete":
      pdf = await generateIncompleteSlipPdf(bookingId, requestOrigin, { scope: "combined" });
      break;
  }
  if (!pdf) throw new Error(`Unsupported slip kind: ${kind}`);
  return { pdf, totalMs: Date.now() - started };
}

export async function runPremiumSlipRenderTest(opts: {
  kind: PremiumSlipTestKind;
  bookingId?: number;
  requestOrigin: string;
  runId?: string;
}): Promise<PremiumSlipTestRunResult> {
  purgeExpiredRuns();
  const bookingId = await resolveTestBooking(opts.bookingId);
  const runId = opts.runId ?? `ps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const rootId = PREMIUM_SLIP_ROOT_ID[opts.kind as PremiumSlipKind];
  const requiredSections = PREMIUM_SLIP_REQUIRED_SECTIONS[opts.kind as PremiumSlipKind];

  let render: PremiumSlipRenderTestResult = {
    kind: opts.kind,
    ok: false,
    templateVersion: PREMIUM_SLIP_TEMPLATE_VERSION,
    pdfSizeBytes: 0,
    pageCount: 0,
    totalMs: 0,
    rootId,
    requiredSections,
    sectionsValidated: true,
  };

  try {
    const { pdf, totalMs } = await renderPremiumSlipForTest(opts.kind, bookingId, opts.requestOrigin);
    assertPremiumSlipPdf(pdf, opts.kind as PremiumSlipKind);
    const token = `${runId}-${opts.kind}`;
    const store = runs.get(runId) ?? {
      createdAt: Date.now(),
      bookingId,
      results: [],
      pdfByToken: new Map(),
    };
    store.pdfByToken.set(token, { pdf, kind: opts.kind, bookingId });
    runs.set(runId, store);

    render = {
      ...render,
      ok: true,
      pdfSizeBytes: pdf.byteLength,
      pageCount: countPdfPages(pdf),
      totalMs,
      downloadToken: token,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Render failed";
    render = {
      ...render,
      ok: false,
      error: msg,
      retryable: /timeout|503|retry/i.test(msg),
      failureStage: /navigation|launch|dom|pdf|timeout/i.exec(msg)?.[0] ?? "render",
      totalMs: 0,
    };
  }

  const result: PremiumSlipTestRunResult = { runId, bookingId, render };
  const store = runs.get(runId);
  if (store) {
    store.results.push(result);
  } else {
    runs.set(runId, {
      createdAt: Date.now(),
      bookingId,
      results: [result],
      pdfByToken: new Map(),
    });
  }
  return result;
}

export async function runPremiumSlipSendTest(opts: {
  runId: string;
  kind: PremiumSlipTestKind;
  testPhone: string;
}): Promise<PremiumSlipSendTestResult> {
  purgeExpiredRuns();
  const normalized = normalizeIndianPhone(opts.testPhone);
  if (!normalized) {
    return {
      ok: false,
      metaRequestStarted: false,
      method: "none",
      recipientMasked: maskIndianPhone(opts.testPhone),
      error: "Invalid approved test phone number",
    };
  }

  const run = runs.get(opts.runId);
  const token = `${opts.runId}-${opts.kind}`;
  const entry = run?.pdfByToken.get(token);
  if (!entry?.pdf) {
    return {
      ok: false,
      metaRequestStarted: false,
      method: "none",
      recipientMasked: maskIndianPhone(normalized),
      error: "Render the slip successfully before sending to test number",
    };
  }

  if (!isWhatsAppConfigured()) {
    return {
      ok: false,
      metaRequestStarted: false,
      method: "none",
      recipientMasked: maskIndianPhone(normalized),
      error: "WhatsApp Meta API is not configured",
    };
  }

  const filename = `PremiumSlipTest_${opts.kind}_${entry.bookingId}.pdf`;
  const uploaded = await uploadWhatsAppMedia(entry.pdf, filename);
  if (!uploaded.ok) {
    return {
      ok: false,
      metaRequestStarted: true,
      method: "none",
      recipientMasked: maskIndianPhone(normalized),
      error: uploaded.error,
    };
  }

  const sent = await sendWhatsAppDocumentByMediaId(
    normalized,
    uploaded.mediaId,
    filename,
    `Premium slip test (${opts.kind}) — owner verification only`,
  );

  return {
    ok: sent.ok,
    metaRequestStarted: true,
    messageId: sent.ok ? sent.messageId : undefined,
    method: "freeform_document",
    recipientMasked: maskIndianPhone(normalized),
    sentAt: new Date().toISOString(),
    error: sent.ok ? undefined : sent.error,
  };
}

export function getPremiumSlipTestRunStatus(runId: string) {
  purgeExpiredRuns();
  const run = runs.get(runId);
  if (!run) return null;
  return {
    runId,
    bookingId: run.bookingId,
    createdAt: new Date(run.createdAt).toISOString(),
    results: run.results,
  };
}

export function getPremiumSlipTestPdf(downloadToken: string): {
  pdf: Buffer;
  kind: PremiumSlipTestKind;
  bookingId: number;
} | null {
  purgeExpiredRuns();
  for (const run of runs.values()) {
    const entry = run.pdfByToken.get(downloadToken);
    if (entry) return entry;
  }
  return null;
}

export async function runAllPremiumSlipRenderTests(opts: {
  bookingId?: number;
  requestOrigin: string;
}): Promise<{ runId: string; bookingId: number; results: PremiumSlipTestRunResult[] }> {
  const runId = `ps-all-${Date.now().toString(36)}`;
  const kinds: PremiumSlipTestKind[] = ["booking", "delivery", "return", "incomplete"];
  const results: PremiumSlipTestRunResult[] = [];
  for (const kind of kinds) {
    results.push(
      await runPremiumSlipRenderTest({
        kind,
        bookingId: opts.bookingId,
        requestOrigin: opts.requestOrigin,
        runId,
      }),
    );
  }
  const bookingId = results[0]?.bookingId ?? (await resolveTestBooking(opts.bookingId));
  return { runId, bookingId, results };
}
