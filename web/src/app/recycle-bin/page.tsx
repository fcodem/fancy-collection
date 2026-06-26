import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import RecycleBinClient from "@/components/RecycleBinClient";

export default async function RecycleBinPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell>
      <RecycleBinClient />
    </ServerAppShell>
  );
}
