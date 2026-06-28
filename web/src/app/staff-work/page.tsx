import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import StaffWorkClient from "@/components/StaffWorkClient";
import { todayIso } from "@/lib/constants";

export default async function StaffWorkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <StaffWorkClient todayIso={todayIso()} />
  );
}
