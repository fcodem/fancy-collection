import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import WhatsAppTemplatesClient from "@/components/whatsapp/WhatsAppTemplatesClient";

export const metadata = { title: "WhatsApp Templates" };

export default async function WhatsAppTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <ServerAppShell>
      <WhatsAppTemplatesClient />
    </ServerAppShell>
  );
}
