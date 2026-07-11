import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ManageCategoriesClient from "@/components/ManageCategoriesClient";

export const dynamic = "force-dynamic";

export default async function ManageCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; title?: string; detail?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  const sp = await searchParams;
  const saveConfirmed =
    sp.saved === "1"
      ? {
          title: sp.title ? decodeURIComponent(sp.title) : "Saved",
          detail: sp.detail ? decodeURIComponent(sp.detail) : undefined,
        }
      : undefined;

  return <ManageCategoriesClient saveConfirmed={saveConfirmed} />;
}
