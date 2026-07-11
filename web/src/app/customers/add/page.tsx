import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import CustomerFormClient from "@/components/CustomerFormClient";

export const dynamic = "force-dynamic";

export default async function CustomerAddPage({
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
          title: sp.title ? decodeURIComponent(sp.title) : "Customer saved",
          detail: sp.detail ? decodeURIComponent(sp.detail) : undefined,
        }
      : undefined;

  return (
    <CustomerFormClient
      key={saveConfirmed ? `saved-${saveConfirmed.detail ?? "ok"}` : "new"}
      saveConfirmed={saveConfirmed}
    />
  );
}
