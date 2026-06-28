import prisma from "@/lib/prisma";
import BookingFormClient from "@/components/BookingFormClient";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export default async function NewProspectLeadPage() {
  const cats = await getAllCategories();
  const staff = await prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <BookingFormClient
        mode="prospect"
        today={todayIso()}
        staffList={staff.map((s) => s.name)}
        mensCategories={cats.mens_categories}
        womensCategories={cats.womens_categories}
        jewelleryCategories={cats.jewellery_categories}
        accessoryCategories={cats.accessory_categories}
      />
  );
}
