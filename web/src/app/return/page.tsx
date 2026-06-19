import ServerAppShell from "@/components/ServerAppShell";
import BookingSearchPage from "@/components/BookingSearchPage";
import { todayIso } from "@/lib/constants";

export default async function ReturnPage() {
  return (
    <ServerAppShell>
      <BookingSearchPage
        title="Find Booking to Return"
        apiPath="/api/return/search"
        detailHref="/return/{id}"
        dateLabel="Date of Return"
        showRemaining
        todayIso={todayIso()}
      />
    </ServerAppShell>
  );
}
