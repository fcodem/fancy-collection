import { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUserForLayout, isOwner } from "@/lib/auth";
import { isBareRoute } from "@/lib/shellRoutes";
import AuthShellGateClient from "@/components/AuthShellGateClient";

/** Auth + persistent AppShell for staff pages; bare routes (login, slips) skip the shell.
 * Uses cookie-only identity when available (no Prisma on navigation). */
export default async function AuthShellGate({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";

  if (pathname && isBareRoute(pathname)) {
    return children;
  }

  const user = await getCurrentUserForLayout();

  if (!user) {
    if (pathname && !isBareRoute(pathname)) redirect("/login");
    return children;
  }

  return (
    <AuthShellGateClient isOwner={isOwner(user as { role: string })} username={user.username}>
      {children}
    </AuthShellGateClient>
  );
}
