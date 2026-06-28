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
        showCategoryFilter
        categories={categories}
        actionLabel="Deliver"
        actionIcon="fa-truck-fast"
        todayIso={todayIso()}
        hint="Shows bookings for the selected date first, then ±1 day, then other dates. Category is optional."
      />
  );
}
