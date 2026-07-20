import { BookingItemWarningsSection } from "@/components/BookingItemWarningsSection";
import BookingWarningsRetry from "@/components/BookingWarningsRetry";
import { loadBookingRecordWarnings } from "@/lib/services/bookingRecordData";
import type { WarningMapBooking } from "@/lib/bookingWarnings";

export default async function BookingWarningsAsync({
  booking,
}: {
  booking: WarningMapBooking;
}) {
  try {
    const warningItems = await loadBookingRecordWarnings(booking);
    return <BookingItemWarningsSection items={warningItems} />;
  } catch {
    return <BookingWarningsRetry bookingId={booking.id} />;
  }
}
