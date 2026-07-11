import BookingSearchPage from "@/components/BookingSearchPage";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export const revalidate = 30;

export default async function ReturnPage() {
  const categories = await getAllCategories();
  return (
    <BookingSearchPage
      title="Booking Return"
      apiPath="/api/return/search"
      detailHref="/return/{id}"
      dateLabel="Return Date"
      monthGroupField="return"
      showRemaining
      showStatus
      showDeliveryInfo
      showCategoryFilter
      categories={categories}
      actionLabel="Return"
      actionIcon="fa-rotate-left"
      todayIso={todayIso()}
      hint="All pending returns, grouped by month, oldest date first. Use Search or Category to filter."
    />
  );
}
