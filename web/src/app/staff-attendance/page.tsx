import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import StaffAttendanceClient from "@/components/StaffAttendanceClient";
import { todayIso } from "@/lib/constants";

export default async function StaffAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const owner = isOwner(user);
  const [staffList, allUsers] = await Promise.all([
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    owner
      ? prisma.user.findMany({
          orderBy: { username: "asc" },
          select: { id: true, username: true, role: true, staffId: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <ServerAppShell>
      <StaffAttendanceClient
        staffList={staffList}
        allUsers={allUsers}
        isOwner={owner}
        initialToday={todayIso()}
      />
    </ServerAppShell>
  );
}
