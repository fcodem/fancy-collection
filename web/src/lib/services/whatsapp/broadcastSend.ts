import prisma from "@/lib/prisma";
import {
  sendWhatsAppImageHeaderTemplate,
  sendWhatsAppTemplate,
  uploadWhatsAppMedia,
} from "@/lib/services/whatsapp/metaApi";
import {
  loadSale1FlyerBuffer,
  SALE_1_FLYER_FILENAME,
} from "@/lib/services/whatsapp/sale1TemplateCopy";

export type BroadcastRecipient = { phone: string; name: string };

const SEND_GAP_MS = 80;

function parseRecipients(raw: unknown): BroadcastRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const phone = String((row as { phone?: unknown }).phone || "").trim();
      const name = String((row as { name?: unknown }).name || "Customer").trim() || "Customer";
      return phone ? { phone, name } : null;
    })
    .filter((r): r is BroadcastRecipient => Boolean(r));
}

async function loadFlyerForTemplate(templateName: string): Promise<Buffer | null> {
  const n = templateName.trim().toLowerCase();
  if (n === "sale_1" || n === "sale1") return loadSale1FlyerBuffer();
  return null;
}

/** Mark orphaned "sending" rows that never persisted a recipient queue. */
export async function failOrphanBroadcasts(): Promise<number> {
  const cutoff = new Date(Date.now() - 90_000);
  const stuck = await prisma.whatsAppBroadcast.findMany({
    where: {
      status: "sending",
      sentCount: 0,
      failedCount: 0,
      createdAt: { lt: cutoff },
    },
    select: { id: true, recipientsJson: true },
    take: 50,
  });
  let n = 0;
  for (const row of stuck) {
    const recipients = parseRecipients(row.recipientsJson);
    if (recipients.length > 0) continue;
    await prisma.whatsAppBroadcast.update({
      where: { id: row.id },
      data: {
        status: "failed",
        lastError:
          "Background send did not start on the server. Please start a new broadcast — sends are now saved and continued automatically.",
        completedAt: new Date(),
      },
    });
    n++;
  }
  return n;
}

/**
 * Process up to `limit` queued recipients for one broadcast (or the oldest sending one).
 * Safe to call from after() and from cron — uses nextIndex so runs resume.
 */
export async function processBroadcastBatch(opts?: {
  broadcastId?: number;
  limit?: number;
}): Promise<{
  broadcastId: number | null;
  processed: number;
  sent: number;
  failed: number;
  done: boolean;
  message?: string;
}> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 40, 80));

  const broadcast = opts?.broadcastId
    ? await prisma.whatsAppBroadcast.findUnique({ where: { id: opts.broadcastId } })
    : await prisma.whatsAppBroadcast.findFirst({
        where: { status: "sending" },
        orderBy: { createdAt: "asc" },
      });

  if (!broadcast || broadcast.status !== "sending") {
    return { broadcastId: null, processed: 0, sent: 0, failed: 0, done: false, message: "none" };
  }

  const recipients = parseRecipients(broadcast.recipientsJson);
  if (!recipients.length) {
    await prisma.whatsAppBroadcast.update({
      where: { id: broadcast.id },
      data: {
        status: "failed",
        lastError:
          "No saved recipient list for this broadcast. Please start a new broadcast.",
        completedAt: new Date(),
      },
    });
    return {
      broadcastId: broadcast.id,
      processed: 0,
      sent: 0,
      failed: 0,
      done: true,
      message: "missing_recipients",
    };
  }

  let index = Math.max(0, broadcast.nextIndex || 0);
  let sent = broadcast.sentCount || 0;
  let failed = broadcast.failedCount || 0;
  let lastError = broadcast.lastError;
  let imageMediaId: string | null = null;
  let sinceMediaUpload = 999;
  const needsImage = String(broadcast.headerFormat || "").toUpperCase() === "IMAGE";
  let flyerBuffer: Buffer | null = null;
  if (needsImage) {
    flyerBuffer = await loadFlyerForTemplate(broadcast.templateName);
    if (!flyerBuffer?.length) {
      await prisma.whatsAppBroadcast.update({
        where: { id: broadcast.id },
        data: {
          status: "failed",
          lastError: `Template "${broadcast.templateName}" needs an IMAGE header, but the flyer was not found.`,
          completedAt: new Date(),
        },
      });
      return {
        broadcastId: broadcast.id,
        processed: 0,
        sent,
        failed,
        done: true,
        message: "flyer_missing",
      };
    }
  }

  let processed = 0;
  while (index < recipients.length && processed < limit) {
    const recipient = recipients[index]!;
    index++;
    processed++;

    try {
      if (needsImage && flyerBuffer && (sinceMediaUpload >= 35 || !imageMediaId)) {
        const uploaded = await uploadWhatsAppMedia(
          flyerBuffer,
          SALE_1_FLYER_FILENAME,
          "image/png",
        );
        if (!uploaded.ok) {
          failed++;
          lastError = uploaded.error || "Flyer re-upload failed";
          continue;
        }
        imageMediaId = uploaded.mediaId;
        sinceMediaUpload = 0;
      }

      const bodyParams = broadcast.sendBodyName
        ? [(recipient.name || "Customer").slice(0, 1024)]
        : [];
      const result = imageMediaId
        ? await sendWhatsAppImageHeaderTemplate({
            phone: recipient.phone,
            templateName: broadcast.templateName,
            languageCode: broadcast.language || "en",
            mediaId: imageMediaId,
            bodyParams,
          })
        : await sendWhatsAppTemplate(
            recipient.phone,
            broadcast.templateName,
            broadcast.language || "en",
            bodyParams.length
              ? [
                  {
                    type: "body",
                    parameters: bodyParams.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
          );

      if (result.ok) {
        sent++;
        sinceMediaUpload++;
      } else {
        failed++;
        lastError = result.error || "Send failed";
        console.error(`[broadcast ${broadcast.id}] fail ${recipient.phone}: ${lastError}`);
        if (/media|header|image/i.test(lastError)) imageMediaId = null;
      }
    } catch (e) {
      failed++;
      lastError = e instanceof Error ? e.message : "Send failed";
      console.error(`[broadcast ${broadcast.id}] exception ${recipient.phone}:`, e);
    }

    // Persist often so history shows live progress.
    if (processed % 5 === 0 || index >= recipients.length) {
      await prisma.whatsAppBroadcast.update({
        where: { id: broadcast.id },
        data: {
          nextIndex: index,
          sentCount: sent,
          failedCount: failed,
          lastError: lastError ? lastError.slice(0, 2000) : null,
        },
      });
    }

    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }

  const done = index >= recipients.length;
  await prisma.whatsAppBroadcast.update({
    where: { id: broadcast.id },
    data: {
      nextIndex: index,
      sentCount: sent,
      failedCount: failed,
      lastError: lastError ? lastError.slice(0, 2000) : null,
      ...(done
        ? { status: "completed", completedAt: new Date(), recipientsJson: null }
        : {}),
    },
  });

  console.log(
    `[broadcast ${broadcast.id}] batch +${processed}: ${sent} sent, ${failed} failed, next=${index}/${recipients.length}${done ? " DONE" : ""}`,
  );

  return { broadcastId: broadcast.id, processed, sent, failed, done };
}

/** Drain sending broadcasts until budget expires (cron / after). */
export async function drainBroadcastQueue(opts?: {
  runtimeBudgetMs?: number;
  batchSize?: number;
}): Promise<{ batches: number; orphanFailed: number }> {
  const budgetMs = opts?.runtimeBudgetMs ?? 50_000;
  const batchSize = opts?.batchSize ?? 40;
  const started = Date.now();
  const orphanFailed = await failOrphanBroadcasts();
  let batches = 0;

  while (Date.now() - started < budgetMs) {
    const result = await processBroadcastBatch({ limit: batchSize });
    if (!result.broadcastId || result.processed === 0) break;
    batches++;
    if (result.done) continue;
    // Keep going on same / next broadcast while budget remains.
  }

  return { batches, orphanFailed };
}
