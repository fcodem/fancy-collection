import prisma from "@/lib/prisma";
import BookingFormClient from "@/components/BookingFormClient";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NewProspectLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; serial?: string }>;
}) {
  const sp = await searchParams;
  const saveConfirmedSerial =
    sp.saved === "1" && sp.serial ? parseInt(sp.serial, 10) || undefined : undefined;

  const cats = await getAllCategories();
  const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <BookingFormClient
      key={sp.saved === "1" && sp.serial ? `saved-${sp.serial}` : "new"}
      mode="prospect"
      today={todayIso()}
      staffList={staff.map((s) => s.name)}
      mensCategories={cats.mens_categories}
      womensCategories={cats.womens_categories}
      jewelleryCategories={cats.jewellery_categories}
      accessoryCategories={cats.accessory_categories}
      saveConfirmedSerial={saveConfirmedSerial}
    />
  );
}
