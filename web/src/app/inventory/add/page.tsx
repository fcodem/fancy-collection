import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import InventoryFormClient from "@/components/InventoryFormClient";
import { getAllCategories } from "@/lib/categories";
import { listSubCategories } from "@/lib/services/adminOps";

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

  const [categories, subCategoryRows] = await Promise.all([
    getAllCategories(),
    listSubCategories(),
  ]);

  return (
    <InventoryFormClient
      key={saveConfirmed ? `saved-${saveConfirmed.sku}` : "new"}
      saveConfirmed={saveConfirmed}
      categories={categories}
      subCategories={subCategoryRows.map((s) => s.name)}
    />
  );
}
