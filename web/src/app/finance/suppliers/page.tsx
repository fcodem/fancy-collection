import SuppliersClient from "@/components/SuppliersClient";
import { getAllCategories } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const cats = await getAllCategories();
  const allCategories = [
    ...cats.mens_categories,
    ...cats.womens_categories,
    ...cats.jewellery_categories,
    ...cats.accessory_categories,
  ];
  return <SuppliersClient categories={allCategories} />;
}
