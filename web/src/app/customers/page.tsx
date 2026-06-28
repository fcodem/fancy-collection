import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import CustomersClient from "@/components/CustomersClient";

export default async function CustomersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <CustomersClient />
  );
}
