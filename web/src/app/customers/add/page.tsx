import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import CustomerFormClient from "@/components/CustomerFormClient";

export default async function CustomerAddPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell>
      <CustomerFormClient />
    </ServerAppShell>
  );
}
