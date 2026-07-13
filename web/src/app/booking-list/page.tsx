import BookingListClient from "@/components/BookingListClient";
import { getBookingListDataCached } from "@/lib/services/bookingList";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export default async function BookingListPage() {
  const today = todayIso();
  const [categories, initialData] = await Promise.all([
    getAllCategories(),
    getBookingListDataCached(today, today),
  ]);

  return (
    <BookingListClient
        initialFrom={today}
        initialTo={today}
        initialData={initialData}
        categories={categories}
      />
  );
}
