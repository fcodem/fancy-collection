import ServerAppShell from "@/components/ServerAppShell";
import BookingSearchPage from "@/components/BookingSearchPage";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export default async function AllRecordSearchPage() {
  const categories = await getAllCategories();

  return (
    <ServerAppShell>
      <BookingSearchPage
        title="All Record Search"
        apiPath="/api/all-record-search"
        detailHref="/booking/{id}/edit"
        dateLabel="Year Reference Date"
        showStatus
        showCategoryFilter
        todayIso={todayIso()}
        categories={categories}
        hint="Includes all statuses — booked, delivered, returned, and incomplete return. Customer name searches full lifetime; other fields search within the selected year."
      />
    </ServerAppShell>
  );
}
