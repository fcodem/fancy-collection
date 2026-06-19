import ServerAppShell from "@/components/ServerAppShell";
import BookingListClient from "@/components/BookingListClient";
import { getBookingListData } from "@/lib/services/bookingList";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export default async function BookingListPage() {
  const today = todayIso();
  const [categories, initialData] = await Promise.all([
    getAllCategories(),
    getBookingListData(today, today),
  ]);

  return (
    <ServerAppShell>
      <BookingListClient
        initialFrom={today}
        initialTo={today}
        initialData={initialData}
        categories={categories}
      />
    </ServerAppShell>
  );
}
