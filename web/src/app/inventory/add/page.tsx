import ServerAppShell from "@/components/ServerAppShell";
import InventoryFormClient from "@/components/InventoryFormClient";

export const dynamic = "force-dynamic";

export default async function InventoryAddPage() {
  return (
    <ServerAppShell requireOwner>
      <InventoryFormClient />
    </ServerAppShell>
  );
}
