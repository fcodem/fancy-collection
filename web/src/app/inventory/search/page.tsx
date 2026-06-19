import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import InventorySearchClient from "@/components/InventorySearchClient";

export default async function InventorySearchPage() {
return (
    <ServerAppShell>
      <InventorySearchClient />
    </ServerAppShell>
  );
}
