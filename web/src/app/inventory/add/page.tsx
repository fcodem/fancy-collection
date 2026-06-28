import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import InventoryFormClient from "@/components/InventoryFormClient";

export const dynamic = "force-dynamic";

export default async function InventoryAddPage() {
  const user = await getCurrentUser();
  if (!user || !isOwner(user)) redirect("/inventory");

  return (
    <InventoryFormClient />
  );
}
