import { NextRequest } from "next/server";
import { updateExpense, deleteExpense } from "@/lib/services/ledgerOps";
import { jsonError, jsonOk, requireOwner, isResponse, requireJsonContentType } from "@/lib/api";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _ct = requireJsonContentType(req);
  if (_ct) return _ct;

  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const expenseId = parseInt(id, 10);
  if (!expenseId) return jsonError("Invalid expense");

  try {
    const body = await req.json();
    await updateExpense(
      expenseId,
      {
        date: body.date,
        category: body.category,
        amount: body.amount != null ? Number(body.amount) : undefined,
        paymentMode: body.payment_mode,
        notes: body.notes,
      },
      user.username,
    );
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  const expenseId = parseInt(id, 10);
  if (!expenseId) return jsonError("Invalid expense");

  try {
    await deleteExpense(expenseId, user.username);
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
