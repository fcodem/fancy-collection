import PageShell from "@/components/PageShell";

const routes: Record<string, { title: string; breadcrumb?: string }> = {
  booking: { title: "Booking Panel", breadcrumb: "Manage dress bookings" },
  "booking-list": { title: "Booked Items", breadcrumb: "View booked items by date range" },
  "packing-list": { title: "Packing List", breadcrumb: "Items to pack for delivery" },
  "free-items": { title: "Free Item List", breadcrumb: "Search available dresses by date" },
  "booking-delivery": { title: "Booking Delivery", breadcrumb: "Search and deliver bookings" },
  return: { title: "Return", breadcrumb: "Search delivered bookings to mark return" },
  "remaining-to-deliver": { title: "Remaining to Deliver", breadcrumb: "All undelivered bookings" },
  "returning-today": { title: "Alternate Booking", breadcrumb: "Returning today" },
  "late-return": { title: "Late Returns", breadcrumb: "Overdue returns" },
  "incomplete-return": { title: "Incomplete Return", breadcrumb: "Incomplete returns" },
  "all-record-search": { title: "All Record Search", breadcrumb: "Universal search" },
  inventory: { title: "Manage Inventory", breadcrumb: "Clothing catalog" },
  customers: { title: "Customers", breadcrumb: "Customer database" },
  "manage-categories": { title: "Manage Categories", breadcrumb: "Custom categories" },
  "staff-attendance": { title: "Staff Attendance", breadcrumb: "Attendance tracking" },
  "staff-work": { title: "Staff Work", breadcrumb: "Staff work log" },
  "recycle-bin": { title: "Recycle Bin", breadcrumb: "Cancelled bookings" },
  users: { title: "Manage Users", breadcrumb: "User accounts" },
};

export function makeStubPage(slug: string) {
  const meta = routes[slug] || { title: slug };
  return function StubPage() {
    return <PageShell title={meta.title} breadcrumb={meta.breadcrumb} />;
  };
}
