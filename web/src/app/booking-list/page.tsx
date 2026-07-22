import BookingListClient from "@/components/BookingListClient";
import { getBookingListDataCached } from "@/lib/services/bookingList";
import { todayIso } from "@/lib/constants";
import { addDaysIso } from "@/lib/dateInput";

export const dynamic = "force-dynamic";

export default async function BookingListPage() {
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const initialData = await getBookingListDataCached({
    deliveryDateStr: today,
    returnDateStr: tomorrow,
    page: 1,
  });

  return (
    <BookingListClient
      initialFrom={today}
      initialTo={tomorrow}
      initialData={initialData}
    />
  );
}
