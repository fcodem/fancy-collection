import { NextRequest } from "next/server";
import { getSalaryLedgerSummary, addSalaryEntry } from "@/lib/services/staffOps";
import { jsonError, jsonOk, requireUser, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const data = await getSalaryLedgerSummary(month);
  return jsonOk(data);
}

export async function POST(req: NextRequest) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const entry = await addSalaryEntry(
      {
        staffId: parseInt(String(body.staff_id), 10),
        date: body.date,
        amount: Number(body.amount),
        note: body.note,
      },
      user.username,
    );
    return jsonOk({ ok: true, id: entry.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
