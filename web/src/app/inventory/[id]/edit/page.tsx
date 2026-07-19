import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { Suspense } from "react";
import InventoryFormClient from "@/components/InventoryFormClient";
import { catalogPhotoUrl } from "@/lib/catalogPhotoUrl";

export default async function InventoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/inventory");
  const { id } = await params;
  if (id === "add") redirect("/inventory/add");
  const row = await prisma.clothingItem.findUnique({ where: { id: parseInt(id, 10) } });
  if (!row) notFound();

  const initialPhotoUrl = catalogPhotoUrl(row);

  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Loading…</p>}>
      <InventoryFormClient
        item={{
          id: row.id,
          sku: row.sku,
          name: row.name,
          category: row.category,
          size: row.size,
          color: row.color,
          dailyRate: row.dailyRate,
          deposit: row.deposit,
          subCategory: row.subCategory,
          status: row.status,
          conditionNotes: row.conditionNotes,
          hasNecklace: row.hasNecklace,
          hasEarrings: row.hasEarrings,
          hasTeeka: row.hasTeeka,
          hasPasa: row.hasPasa,
          photo: row.photo,
        }}
        initialPhotoUrl={initialPhotoUrl}
      />
    </Suspense>
  );
}
