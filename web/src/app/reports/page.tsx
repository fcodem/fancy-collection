import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <ServerAppShell>
      <ReportsClient isOwner={user.role === "owner"} />
    </ServerAppShell>
  );
}
