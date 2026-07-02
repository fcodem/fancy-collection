import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { jsonError, jsonOk } from "@/lib/api";
import { sendDailyLateReturnReminders } from "@/lib/lateReturnReminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const summary = await sendDailyLateReturnReminders();
    return jsonOk({ ok: true, ...summary });
  } catch (e) {
    Sentry.captureException(e);
    console.error("late-return-reminders cron failed:", e);
    return jsonError(e instanceof Error ? e.message : "Cron job failed", 500);
  }
}
