import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ImageSyncLoader from "@/components/ImageSyncLoader";

export const dynamic = "force-dynamic";

export default async function ImageSyncPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return <ImageSyncLoader />;
}
