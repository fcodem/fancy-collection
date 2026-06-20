import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import ActivityLogClient from "./ActivityLogClient";

export const dynamic = "force-dynamic";

export default async function ActivityLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell requireOwner>
      <ActivityLogClient />
    </ServerAppShell>
  );
}
