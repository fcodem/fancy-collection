import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import StaffAttendanceClient from "@/components/StaffAttendanceClient";
import { getStaffAttendanceToday } from "@/lib/services/staffOps";
import { todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; title?: string; detail?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  const today = todayIso();
  const todayData = await getStaffAttendanceToday(today);

  const sp = await searchParams;
  const saveConfirmed =
    sp.saved === "1"
      ? {
          title: sp.title ? decodeURIComponent(sp.title) : "Saved",
          detail: sp.detail ? decodeURIComponent(sp.detail) : undefined,
        }
      : undefined;

  return (
    <StaffAttendanceClient
      staffList={todayData.staff}
      initialStatuses={todayData.statuses}
      isOwner
      initialToday={today}
      saveConfirmed={saveConfirmed}
    />
  );
}
