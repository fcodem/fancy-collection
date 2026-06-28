import { redirect } from "next/navigation";

/** Legacy print bill URL — redirects to the booking slip. */
export default async function BookingPrintRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/booking/${id}/slip`);
}
