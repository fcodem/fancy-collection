import { getActiveStaffSessions } from "@/lib/auth";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const sessions = await getActiveStaffSessions();
  return jsonOk(
    sessions.map((s) => ({
      id: s.id,
      user_id: s.userId,
      username: s.user.username,
      staff_name: s.user.staff?.name || s.user.username,
      staff_id: s.user.staffId,
      login_at: s.loginAt.toISOString(),
      last_seen: s.lastSeen.toISOString(),
    }))
  );
}
