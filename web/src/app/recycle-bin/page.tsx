import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import RecycleBinClient from "@/components/RecycleBinClient";

export default async function RecycleBinPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <RecycleBinClient />
  );
}
