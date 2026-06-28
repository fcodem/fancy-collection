import { redirect } from "next/navigation";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import nextDynamic from "next/dynamic";
const BookingCalendarClient = nextDynamic(
  () => import("@/components/BookingCalendarClient"),
  { ssr: false, loading: () => <div style={{ padding: "2rem", color: "var(--bs-secondary)" }}>Loading calendar…</div> }
);

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
