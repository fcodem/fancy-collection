import { listUsers, getStaffWithoutAccounts } from "@/lib/services/adminOps";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const [users, staff_list] = await Promise.all([listUsers(), getStaffWithoutAccounts()]);
  return jsonOk({ users, staff_list });
}
