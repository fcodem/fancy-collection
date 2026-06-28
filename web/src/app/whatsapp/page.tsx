import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import WhatsAppInboxClient from "@/components/whatsapp/WhatsAppInboxClient";

export const metadata = { title: "WhatsApp Inbox" };

export default async function WhatsAppInboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell>
      <WhatsAppInboxClient />
    </ServerAppShell>
  );
}
