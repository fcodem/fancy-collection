import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ManageCategoriesClient from "@/components/ManageCategoriesClient";

export default async function ManageCategoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ManageCategoriesClient />
  );
}
