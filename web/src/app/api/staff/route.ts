import { NextRequest } from "next/server";
import { addStaff } from "@/lib/services/staffOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  try {
    const body = await req.json();
    const staff = await addStaff(body);
    return jsonOk({ ok: true, id: staff.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
