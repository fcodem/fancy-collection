import SuppliersClient from "@/components/SuppliersClient";
import { getAllCategories } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; title?: string; detail?: string }>;
}) {
  const cats = await getAllCategories();
  const allCategories = [
    ...cats.mens_categories,
    ...cats.womens_categories,
    ...cats.jewellery_categories,
    ...cats.accessory_categories,
  ];

  const sp = await searchParams;
  const saveConfirmed =
    sp.saved === "1"
      ? {
          title: sp.title ? decodeURIComponent(sp.title) : "Saved",
          detail: sp.detail ? decodeURIComponent(sp.detail) : undefined,
        }
      : undefined;

  return <SuppliersClient categories={allCategories} saveConfirmed={saveConfirmed} />;
}
