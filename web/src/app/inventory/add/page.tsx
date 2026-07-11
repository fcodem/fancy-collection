import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import InventoryFormClient from "@/components/InventoryFormClient";

export const dynamic = "force-dynamic";

export default async function InventoryAddPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; sku?: string; name?: string; count?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isOwner(user)) redirect("/inventory");

  const sp = await searchParams;
  const saveConfirmed =
    sp.saved === "1"
      ? {
          sku: sp.sku ? decodeURIComponent(sp.sku) : "",
          name: sp.name ? decodeURIComponent(sp.name) : "",
          count: Math.max(1, Number(sp.count) || 1),
        }
      : undefined;

  return (
    <InventoryFormClient
      key={saveConfirmed ? `saved-${saveConfirmed.sku}` : "new"}
      saveConfirmed={saveConfirmed}
    />
  );
}
