import SearchBookingClient from "@/views/SearchBookingClient";
import AppLayout from "@/components/AppLayout";

export default function SearchBookingPage() {
  return (
    <AppLayout title="Search Booking" breadcrumb="Find and edit bookings (searches by month)">
      <SearchBookingClient />
    </AppLayout>
  );
}
