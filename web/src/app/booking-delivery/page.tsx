import ServerAppShell from "@/components/ServerAppShell";
import BookingSearchPage from "@/components/BookingSearchPage";
import { todayIso } from "@/lib/constants";

export default async function DeliveryPage() {
  return (
    <ServerAppShell>
      <BookingSearchPage
        title="Find Booking to Deliver"
        apiPath="/api/delivery/search"
        detailHref="/booking-delivery/{id}"
        dateLabel="Date of Delivery"
        todayIso={todayIso()}
      />
    </ServerAppShell>
  );
}
