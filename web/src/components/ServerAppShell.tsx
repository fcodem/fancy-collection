import { ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { getOverdueDeliveryCount } from "@/lib/services/core";
import AppShell from "@/components/AppShell";

/** One server auth read + overdue badge — avoids client /api/dashboard/nav-counts on every page. */
export default async function ServerAppShell({
  children,
  requireOwner = false,
}: {
  children: ReactNode;
  requireOwner?: boolean;
}) {
  await connection();
  const [user, overdueDelivery] = await Promise.all([getCurrentUser(), getOverdueDeliveryCount()]);
  if (!user) redirect("/login");
  if (requireOwner && !isOwner(user)) redirect("/inventory");

  return (
    <AppShell
      isOwner={isOwner(user)}
      username={user.username}
      initialOverdueDelivery={overdueDelivery}
    >
      {children}
    </AppShell>
  );
}