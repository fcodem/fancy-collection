import { NextRequest } from "next/server";
import { removeStaff, updateStaffSalaryInfo } from "@/lib/services/staffOps";
import { jsonError, jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    await removeStaff(parseInt(id, 10));
    return jsonOk({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const { id } = await params;
  try {
    const body = await req.json();
    const staff = await updateStaffSalaryInfo(
      parseInt(id, 10),
      {
        monthlySalary: body.monthly_salary != null ? Number(body.monthly_salary) : null,
        salaryDate: body.salary_date != null ? Number(body.salary_date) : null,
      },
      user.username,
    );
    return jsonOk({ ok: true, id: staff.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed");
  }
}
