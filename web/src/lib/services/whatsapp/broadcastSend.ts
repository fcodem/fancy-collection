import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  sendWhatsAppImageHeaderTemplate,
  sendWhatsAppTemplate,
  uploadWhatsAppMedia,
} from "@/lib/services/whatsapp/metaApi";
import {
  isSale1FlyerTemplate,
  loadSale1FlyerBuffer,
  SALE_1_FLYER_FILENAME,
} from "@/lib/services/whatsapp/sale1TemplateCopy";
import {
  parseBroadcastRecipientsPayload,
  type BroadcastRecipient,
} from "@/lib/services/whatsapp/broadcastPayload";
import { buildBodyParamsForSlots } from "@/lib/whatsappTemplateVars";

export type { BroadcastRecipient };

const SEND_GAP_MS = 80;

async function loadHeaderImageBuffer(
  templateName: string,
  headerImagePath?: string | null,
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  if (headerImagePath) {
    if (headerImagePath.startsWith("http://") || headerImagePath.startsWith("https://")) {
      try {
        const res = await fetch(headerImagePath, { cache: "no-store" });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          if (buffer.length) {
            const mimeType = (res.headers.get("content-type") || "image/jpeg").split(";")[0]!;
            const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
            return { buffer, filename: `broadcast-header.${ext}`, mimeType };
          }
        }
      } catch {
        /* fall through */
      }
    }
    const localCandidates = [
      path.join(process.cwd(), headerImagePath.replace(/^\//, "")),
      path.join(process.cwd(), "public", headerImagePath.replace(/^\//, "")),
      path.join(process.cwd(), "web", headerImagePath.replace(/^\//, "")),
    ];
    for (const candidate of localCandidates) {
      if (!existsSync(candidate)) continue;
      try {
        const buffer = readFileSync(candidate);
        const ext = path.extname(candidate).slice(1) || "jpg";
        const mimeType =
          ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        return { buffer, filename: path.basename(candidate), mimeType };
      } catch {
        /* try next */
      }
    }
  }

  if (isSale1FlyerTemplate(templateName)) {
    const buffer = await loadSale1FlyerBuffer();
    if (buffer?.length) {
      return { buffer, filename: SALE_1_FLYER_FILENAME, mimeType: "image/png" };
    }
  }
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
    const recipients = parseBroadcastRecipientsPayload(row.recipientsJson).recipients;
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

  const payload = parseBroadcastRecipientsPayload(broadcast.recipientsJson);
  const recipients = payload.recipients;
  if (!recipients.length) {
    await prisma.whatsAppBroadcast.update({
      where: { id: broadcast.id },
      data: {
        status: "failed",
        lastError: "No saved recipient list for this broadcast. Please start a new broadcast.",
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

  const bodyVarCount = Math.max(
    payload.bodyVariables?.length ?? 0,
    broadcast.sendBodyName ? 1 : 0,
  );
  const useNameForVar1 = broadcast.sendBodyName || payload.useNameForVar1 === true;

  let index = Math.max(0, broadcast.nextIndex || 0);
  let sent = broadcast.sentCount || 0;
  let failed = broadcast.failedCount || 0;
  let lastError = broadcast.lastError;
  let imageMediaId: string | null = payload.headerMediaId || null;
  let sinceMediaUpload = 999;
  const needsImage = String(broadcast.headerFormat || "").toUpperCase() === "IMAGE";
  let headerFile: { buffer: Buffer; filename: string; mimeType: string } | null = null;
  if (needsImage) {
    headerFile = await loadHeaderImageBuffer(broadcast.templateName, payload.headerImagePath);
    if (!headerFile?.buffer.length) {
      await prisma.whatsAppBroadcast.update({
        where: { id: broadcast.id },
        data: {
          status: "failed",
          lastError: `Template "${broadcast.templateName}" needs an IMAGE header, but no image was found.`,
          completedAt: new Date(),
        },
      });
      return {
        broadcastId: broadcast.id,
        processed: 0,
        sent,
        failed,
        done: true,
        message: "header_missing",
      };
    }
  }

  let processed = 0;
  while (index < recipients.length && processed < limit) {
    const recipient = recipients[index]!;
    index++;
    processed++;

    try {
      if (needsImage && headerFile && (sinceMediaUpload >= 35 || !imageMediaId)) {
        const uploaded = await uploadWhatsAppMedia(
          headerFile.buffer,
          headerFile.filename,
          headerFile.mimeType,
        );
        if (!uploaded.ok) {
          failed++;
          lastError = uploaded.error || "Header image re-upload failed";
          continue;
        }
        imageMediaId = uploaded.mediaId;
        sinceMediaUpload = 0;
      }

      const bodyParams = buildBodyParamsForSlots(
        bodyVarCount,
        payload.bodyVariables || [],
        recipient.name,
        useNameForVar1,
      );

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
        ? {
            status: "completed",
            completedAt: new Date(),
            recipientsJson: Prisma.DbNull,
          }
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
  }

  return { batches, orphanFailed };
}
