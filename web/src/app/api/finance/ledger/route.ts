import { NextRequest } from "next/server";
import { addExpense, getLedgerSummary, getLedgerTrend } from "@/lib/services/ledgerOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;

  const today = new Date().toISOString().slice(0, 10);
  const from = req.nextUrl.searchParams.get("from") || today;
  const to = req.nextUrl.searchParams.get("to") || from;
  const trendMonth = req.nextUrl.searchParams.get("trend_month") || "";
  const trendMonths = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("trend_months") || "6", 10) || 6, 1),
    24,
  );

  const summary = await getLedgerSummary(from, to);
  const trend = trendMonth ? await getLedgerTrend(trendMonth, trendMonths) : null;

  return jsonOk({ ...summary, trend });
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;

  try {
    const body = await req.json();
    const entry = await addExpense(
      {
        date: body.date,
        category: body.category,
        amount: Number(body.amount),
        paymentMode: body.payment_mode,
        notes: body.notes,
      },
      user.username,
    );
    return jsonOk({ ok: true, id: entry.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
