import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import WhatsAppConnectionClient from "@/components/whatsapp/WhatsAppConnectionClient";

export const metadata = { title: "WhatsApp Connection" };

export default async function WhatsAppConnectionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");
  return <WhatsAppConnectionClient />;
}
