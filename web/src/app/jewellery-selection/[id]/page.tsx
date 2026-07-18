import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUserForLayout } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatDate } from "@/lib/constants";
import { getAllCategories } from "@/lib/categories";
import { serializeJewellerySelections } from "@/lib/services/jewelleryOps";
import JewellerySelectionClient from "@/components/JewellerySelectionClient";

export const dynamic = "force-dynamic";

export default async function JewellerySelectionRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (!bookingId) notFound();

  const [booking, categories] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        bookingItems: true,
        legacyItem: { select: { category: true, size: true } },
        selectedJewellery: { where: { status: "active" }, orderBy: { id: "asc" } },
      },
    }),
    getAllCategories(),
  ]);
  if (!booking) notFound();

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/jewellery-selection" className="btn btn-outline btn-sm">
          <i className="fa-solid fa-arrow-left" /> Back to Jewellery Selection
        </Link>
      </div>
      <JewellerySelectionClient
        bookingId={booking.id}
        monthlySerial={booking.monthlySerial}
        booking={{
          ...booking,
          deliveryDate: formatDate(booking.deliveryDate),
          returnDate: formatDate(booking.returnDate),
        }}
        initialSelections={serializeJewellerySelections(booking.selectedJewellery)}
        categories={{
          mens_categories: categories.mens_categories,
          womens_categories: categories.womens_categories,
          jewellery_categories: categories.jewellery_categories,
          accessory_categories: categories.accessory_categories,
        }}
      />
    </>
  );
}
