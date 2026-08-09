import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { Suspense } from "react";
import InventoryFormClient from "@/components/InventoryFormClient";
import { catalogPhotoUrl } from "@/lib/catalogPhotoUrl";
import { getAllCategories } from "@/lib/categories";
import { listSubCategories } from "@/lib/services/adminOps";
import {
  isMensInventoryCategory,
  listMensProductSizes,
} from "@/lib/services/inventoryList";
import { stripUnitSuffix } from "@/lib/dress";

export default async function InventoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/inventory");
  const { id } = await params;
  if (id === "add") redirect("/inventory/add");
  const [row, categories, subCategoryRows] = await Promise.all([
    prisma.clothingItem.findUnique({ where: { id: parseInt(id, 10) } }),
    getAllCategories(),
    listSubCategories(),
  ]);
  if (!row) notFound();

  const isMensProduct = isMensInventoryCategory(row.category);
  const mensSizes = isMensProduct
    ? await listMensProductSizes(row.name, row.category)
    : [];
  const productName = isMensProduct ? stripUnitSuffix(row.name) : row.name;
  const initialPhotoUrl = catalogPhotoUrl(row);

  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Loading…</p>}>
      <InventoryFormClient
        key={`${row.id}-product`}
        item={{
          id: row.id,
          sku: row.sku,
          name: productName,
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
          hasSheeshpatti: row.hasSheeshpatti,
          hasNath: row.hasNath,
          hasHathfool: row.hasHathfool,
          hasKamarband: row.hasKamarband,
          hasRings: row.hasRings,
          hasLongHar: row.hasLongHar,
          photo: row.photo,
        }}
        initialPhotoUrl={initialPhotoUrl}
        categories={categories}
        subCategories={subCategoryRows.map((s) => s.name)}
        mensProductEdit={
          isMensProduct
            ? {
                sizes: mensSizes.map((s) => ({
                  size: s.size,
                  primaryId: s.primaryId,
                  primarySku: s.primarySku,
                  totalQuantity: s.totalQuantity,
                  availableQuantity: s.availableQuantity,
                })),
              }
            : undefined
        }
      />
    </Suspense>
  );
}
