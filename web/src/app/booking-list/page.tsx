import BookingListClient from "@/components/BookingListClient";
import { getBookingListDataCached } from "@/lib/services/bookingList";
import { todayIso } from "@/lib/constants";

export default async function BookingListPage() {
  const today = todayIso();
  const initialData = await getBookingListDataCached({
    deliveryDateStr: today,
    returnDateStr: today,
    page: 1,
  });

  return (
    <BookingListClient
      initialFrom={today}
      initialTo={today}
      initialData={initialData}
    />
  );
}
