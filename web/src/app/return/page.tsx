import ServerAppShell from "@/components/ServerAppShell";
import BookingSearchPage from "@/components/BookingSearchPage";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ReturnPage() {
  const categories = await getAllCategories();
  return (
    <ServerAppShell>
      <BookingSearchPage
        title="Booking Return"
        apiPath="/api/return/search"
        detailHref="/return/{id}"
        dateLabel="Return Date"
        showRemaining
        showStatus
        showDeliveryInfo
        showCategoryFilter
        categories={categories}
        actionLabel="Return"
        actionIcon="fa-rotate-left"
        todayIso={todayIso()}
        hint="Shows bookings for the selected date first, then ±1 day, then other dates. Category is optional."
      />
    </ServerAppShell>
  );
}
