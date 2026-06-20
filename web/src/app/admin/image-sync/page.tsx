import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import ImageSyncClient from "@/components/ImageSyncClient";

export const dynamic = "force-dynamic";

export default async function ImageSyncPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return (
    <ServerAppShell>
      <ImageSyncClient />
    </ServerAppShell>
  );
}
