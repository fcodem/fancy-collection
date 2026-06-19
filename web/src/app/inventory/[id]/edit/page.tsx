import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import InventoryFormClient from "@/components/InventoryFormClient";

export default async function InventoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/inventory");
  const { id } = await params;
  if (id === "add") redirect("/inventory/add");
  const item = await prisma.clothingItem.findUnique({ where: { id: parseInt(id, 10) } });
  if (!item) notFound();
  return (
    <ServerAppShell>
      <InventoryFormClient item={item as unknown as Record<string, unknown>} />
    </ServerAppShell>
  );
}
