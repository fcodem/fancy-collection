import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import ResetDataClient from "@/components/ResetDataClient";

export default async function ResetDataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell>
      <ResetDataClient />
    </ServerAppShell>
  );
}
