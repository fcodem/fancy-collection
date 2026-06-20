import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import BookingCalendarClient from "@/components/BookingCalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  return (
    <ServerAppShell>
      <BookingCalendarClient />
    </ServerAppShell>
  );
}
