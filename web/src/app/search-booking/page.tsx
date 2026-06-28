import BookingSearchPage from "@/components/BookingSearchPage";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export default async function SearchBookingPage() {
  const categories = await getAllCategories();

  return (
    <BookingSearchPage
        title="Search Booking"
        apiPath="/api/search-booking"
        detailHref="/booking/{id}/edit"
        showRecordActions
        dateLabel="Month (pick any date)"
        showStatus
        showCategoryFilter
        monthBased
        todayIso={todayIso()}
        categories={categories}
      />
  );
}
