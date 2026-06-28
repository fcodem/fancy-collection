import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ActivityLogClient from "./ActivityLogClient";

export const dynamic = "force-dynamic";

export default async function ActivityLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ActivityLogClient />
  );
}
