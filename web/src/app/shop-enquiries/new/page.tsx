import prisma from "@/lib/prisma";
import ShopEnquiryFormClient from "@/components/ShopEnquiryFormClient";
import { todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NewShopEnquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; title?: string; detail?: string }>;
}) {
  const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const sp = await searchParams;
  const saveConfirmed =
    sp.saved === "1"
      ? {
          title: sp.title ? decodeURIComponent(sp.title) : "Shop enquiry saved",
          detail: sp.detail ? decodeURIComponent(sp.detail) : undefined,
        }
      : undefined;

  return (
    <ShopEnquiryFormClient
      key={saveConfirmed ? `saved-${saveConfirmed.detail ?? "ok"}` : "new"}
      today={todayIso()}
      staffList={staff.map((s) => s.name)}
      saveConfirmed={saveConfirmed}
    />
  );
}
