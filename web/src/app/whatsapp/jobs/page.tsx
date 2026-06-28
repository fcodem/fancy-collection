import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import WhatsAppJobsClient from "@/components/whatsapp/WhatsAppJobsClient";

export const metadata = { title: "WhatsApp Job Queue" };

export default async function WhatsAppJobsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell>
      <WhatsAppJobsClient />
    </ServerAppShell>
  );
}
