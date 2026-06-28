import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import CustomerFormClient from "@/components/CustomerFormClient";

export default async function CustomerAddPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <CustomerFormClient />
  );
}
