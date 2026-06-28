import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import StaffAttendanceClient from "@/components/StaffAttendanceClient";
import { todayIso } from "@/lib/constants";

export default async function StaffAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  const [staffList, allUsers] = await Promise.all([
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      orderBy: { username: "asc" },
      select: { id: true, username: true, role: true, staffId: true },
    }),
  ]);

  return (
    <StaffAttendanceClient
        staffList={staffList}
        allUsers={allUsers}
        isOwner
        initialToday={todayIso()}
      />
  );
}
