import { listUsers, getStaffWithoutAccounts } from "@/lib/services/adminOps";
import { getActiveStaffSessions, getPendingStaffLoginRequests } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { jsonOk, requireOwner, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireOwner();
  if (isResponse(user)) return user;
  const [users, staff_list, sessions, pending] = await Promise.all([
    listUsers(),
    getStaffWithoutAccounts(),
    getActiveStaffSessions(),
    getPendingStaffLoginRequests(),
  ]);

  const usernames = sessions.map((s) => s.user.username);
  const recentLogs = usernames.length
    ? await prisma.activityLog.findMany({
        where: { username: { in: usernames } },
        orderBy: { createdAt: "desc" },
        take: Math.min(200, usernames.length * 12),
      })
    : [];

  const recent_activity: Record<
    string,
    Array<{
      id: number;
      action: string;
      entity: string;
      label: string | null;
      createdAt: string;
    }>
  > = {};

  for (const u of usernames) recent_activity[u] = [];
  for (const log of recentLogs) {
    const bucket = recent_activity[log.username];
    if (bucket && bucket.length < 10) {
      bucket.push({
        id: log.id,
        action: log.action,
        entity: log.entity,
        label: log.label,
        createdAt: log.createdAt.toISOString(),
      });
    }
  }

  return jsonOk({
    users,
    staff_list,
    active_sessions: sessions.map((s) => ({
      id: s.id,
      user_id: s.userId,
      username: s.user.username,
      staff_name: s.user.staff?.name || s.user.username,
      staff_id: s.user.staffId,
      login_at: s.loginAt.toISOString(),
      last_seen: s.lastSeen.toISOString(),
    })),
    pending_requests: pending.map((r) => ({
      id: r.id,
      username: r.user.username,
      staff_name: r.user.staff?.name || r.user.username,
      requested_at: r.requestedAt.toISOString(),
    })),
    recent_activity,
  });
}
