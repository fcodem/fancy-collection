import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import AiDashboard from "@/components/dashboard/AiDashboard";

export const dynamic = "force-dynamic";

export default async function AiDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return <AiDashboard />;
}
