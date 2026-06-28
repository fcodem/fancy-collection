import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import RestoreClient from "./RestoreClient";

export const dynamic = "force-dynamic";

export default async function RestorePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <RestoreClient />
  );
}
