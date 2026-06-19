import ServerAppShell from "@/components/ServerAppShell";
import BookingSearchPage from "@/components/BookingSearchPage";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export default async function SearchBookingPage() {
  const categories = await getAllCategories();

  return (
    <ServerAppShell>
      <BookingSearchPage
        title="Search Booking"
        apiPath="/api/search-booking"
        detailHref="/booking/{id}/edit"
        dateLabel="Date (Month Reference)"
        showStatus
        showCategoryFilter
        monthBased
        todayIso={todayIso()}
        categories={categories}
      />
    </ServerAppShell>
  );
}
