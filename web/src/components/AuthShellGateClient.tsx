"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isBareRoute } from "@/lib/shellRoutes";
import AppShell from "@/components/AppShell";

export default function AuthShellGateClient({
  children,
  isOwner,
  username,
}: {
  children: ReactNode;
  isOwner: boolean;
  username: string;
}) {
  const pathname = usePathname();

  if (isBareRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <AppShell isOwner={isOwner} username={username}>
      {children}
    </AppShell>
  );
}
