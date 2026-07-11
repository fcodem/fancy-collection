import BookingSearchPage from "@/components/BookingSearchPage";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export const revalidate = 30;

export default async function DeliveryPage() {
  const categories = await getAllCategories();
  return (
    <BookingSearchPage
      title="Booking Delivery"
      apiPath="/api/delivery/search"
      detailHref="/booking-delivery/{id}"
      dateLabel="Delivery Date"
      monthGroupField="delivery"
      showCategoryFilter
      categories={categories}
      actionLabel="Deliver"
      actionIcon="fa-truck-fast"
      todayIso={todayIso()}
      hint="All booked deliveries, grouped by month, oldest date first. Use Search or Category to filter."
    />
  );
}
