import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import WhatsAppBotSettingsClient from "@/components/whatsapp/WhatsAppBotSettingsClient";

export const metadata = { title: "WhatsApp Bot Settings" };

export default async function WhatsAppBotSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return <WhatsAppBotSettingsClient />;
}
