import { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { isBareRoute } from "@/lib/shellRoutes";
import AuthShellGateClient from "@/components/AuthShellGateClient";

/** Auth + persistent AppShell for staff pages; bare routes (login, slips) skip the shell. */
export default async function AuthShellGate({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";

  if (pathname && isBareRoute(pathname)) {
    return children;
  }

  const user = await getCurrentUser();

  if (!user) {
    if (pathname && !isBareRoute(pathname)) redirect("/login");
    return children;
  }

  return (
    <AuthShellGateClient isOwner={isOwner(user)} username={user.username}>
      {children}
    </AuthShellGateClient>
  );
}
