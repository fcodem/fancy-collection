import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import ShopEnquiryFormClient from "@/components/ShopEnquiryFormClient";
import { todayIso } from "@/lib/constants";

export default async function NewShopEnquiryPage() {
  const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <ServerAppShell>
      <ShopEnquiryFormClient today={todayIso()} staffList={staff.map((s) => s.name)} />
    </ServerAppShell>
  );
}
