import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell>
      <ReportsClient isOwner />
    </ServerAppShell>
  );
}
