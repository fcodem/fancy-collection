import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import AppShell from "@/components/AppShell";

/** Auth shell — overdue badge loads once on the client to avoid an extra DB query on every navigation. */
export default async function ServerAppShell({
  children,
  requireOwner = false,
}: {
  children: ReactNode;
  requireOwner?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (requireOwner && !isOwner(user)) redirect("/inventory");

  return (
    <AppShell isOwner={isOwner(user)} username={user.username}>
      {children}
    </AppShell>
  );
}