import { redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import PrintCodesClient from "@/components/PrintCodesClient";

export const dynamic = "force-dynamic";

export default async function PrintCodesPage() {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");
  return <PrintCodesClient />;
}
