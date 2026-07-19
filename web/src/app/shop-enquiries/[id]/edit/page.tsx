import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import ShopEnquiryFormClient from "@/components/ShopEnquiryFormClient";
import { formatDate } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EditShopEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!id) notFound();

  const [enquiry, staff] = await Promise.all([
    prisma.shopEnquiry.findUnique({ where: { id } }),
    prisma.staff.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!enquiry) notFound();

  return (
    <ShopEnquiryFormClient
      enquiryId={enquiry.id}
      staffList={staff.map((s) => s.name)}
      initial={{
        customerName: enquiry.customerName,
        customerAddress: enquiry.customerAddress || "",
        contact1: enquiry.contact1 || "",
        whatsapp: enquiry.whatsappNo || "",
        enquiryNotes: enquiry.enquiryNotes || "",
        visitDate: formatDate(enquiry.visitDate, "iso"),
        dressNeededDate: enquiry.dressNeededDate
          ? formatDate(enquiry.dressNeededDate, "iso")
          : "",
        staffNames: enquiry.staffNames ? enquiry.staffNames.split(", ") : [],
      }}
    />
  );
}
