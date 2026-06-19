import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import ChangePasswordClient from "@/components/ChangePasswordClient";

export default async function ChangePasswordPage() {
return (
    <ServerAppShell>
      <ChangePasswordClient />
    </ServerAppShell>
  );
}
