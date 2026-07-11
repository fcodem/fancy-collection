import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import AiSettingsClient from "@/components/AiSettingsClient";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return <AiSettingsClient />;
}
