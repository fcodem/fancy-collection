import prisma from "@/lib/prisma";
import ServerAppShell from "@/components/ServerAppShell";
import BookingFormClient from "@/components/BookingFormClient";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

/** Server page for creating a new booking — loads categories/staff and renders BookingFormClient. */
export const dynamic = "force-dynamic";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; serial?: string }>;
}) {
  const sp = await searchParams;
  const saveConfirmedSerial =
    sp.confirmed === "1" && sp.serial ? parseInt(sp.serial, 10) || undefined : undefined;

  const [cats, staff] = await Promise.all([
    getAllCategories(),
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <ServerAppShell>
      <BookingFormClient
        today={todayIso()}
        saveConfirmedSerial={saveConfirmedSerial}
        staffList={staff.map((s) => s.name)}
        mensCategories={cats.mens_categories}
        womensCategories={cats.womens_categories}
        jewelleryCategories={cats.jewellery_categories}
        accessoryCategories={cats.accessory_categories}
      />
    </ServerAppShell>
  );
}
