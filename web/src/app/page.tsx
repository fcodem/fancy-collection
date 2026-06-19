import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import DashboardView from "@/components/DashboardView";
import { getDashboardData } from "@/lib/services/core";
import { getPendingStaffLoginRequests, getActiveStaffSessions, isOwner } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const owner = isOwner(user);
  const [data, pendingStaff, activeStaff] = await Promise.all([
    getDashboardData(),
    owner ? getPendingStaffLoginRequests() : Promise.resolve([]),
    owner ? getActiveStaffSessions() : Promise.resolve([]),
  ]);

  return (
    <ServerAppShell>
      <DashboardView
        data={data}
        isOwner={owner}
        pendingStaff={pendingStaff.map((p) => ({
          id: p.id,
          username: p.user.username,
          staffName: p.user.staff?.name || p.user.username,
          requestedAt: p.requestedAt.toISOString(),
        }))}
        activeStaff={activeStaff.map((s) => ({
          id: s.id,
          username: s.user.username,
          staffName: s.user.staff?.name || s.user.username,
          loginAt: s.loginAt.toISOString(),
        }))}
      />
    </ServerAppShell>
  );
}
