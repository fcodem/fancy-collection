import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import BookingCalendarLoader from "@/components/BookingCalendarLoader";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return <BookingCalendarLoader />;
}
