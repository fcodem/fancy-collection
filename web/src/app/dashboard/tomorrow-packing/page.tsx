import { redirect } from "next/navigation";
import TomorrowPackingClient from "@/components/TomorrowPackingClient";
import { getCurrentUserForLayout } from "@/lib/auth";
import { getTomorrowPackingPageData } from "@/lib/services/tomorrowPacking";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function TomorrowPackingPage() {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const data = await getTomorrowPackingPageData();
  return <TomorrowPackingClient data={data} />;
}
