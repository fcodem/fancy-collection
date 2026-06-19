import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import RecycleBinClient from "@/components/RecycleBinClient";

export default async function RecycleBinPage() {
return (
    <ServerAppShell>
      <RecycleBinClient />
    </ServerAppShell>
  );
}
