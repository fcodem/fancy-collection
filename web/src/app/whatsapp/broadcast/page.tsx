import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import WhatsAppBroadcastClient from "@/components/whatsapp/WhatsAppBroadcastClient";

export const metadata = { title: "WhatsApp Broadcast" };

export default async function WhatsAppBroadcastPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return (
    <WhatsAppBroadcastClient />
  );
}
