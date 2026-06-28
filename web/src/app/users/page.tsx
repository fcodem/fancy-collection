import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import UsersClient from "@/components/UsersClient";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <UsersClient />
  );
}
