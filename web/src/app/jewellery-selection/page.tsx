import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserReadOnly } from "@/lib/auth";
import BookingSearchPage from "@/components/BookingSearchPage";
import { getAllCategories } from "@/lib/categories";
import { todayIso } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function JewellerySelectionPanelPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");

  const categories = await getAllCategories();

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontFamily: "Playfair Display, serif", color: "var(--primary)" }}>
            <i className="fa-solid fa-gem" style={{ marginRight: 10 }} />
            Jewellery Selection
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            Only bookings that are not yet delivered are shown. Open a record to add jewellery.
          </p>
        </div>
        <Link href="/jewellery-selection/scan" className="btn btn-primary">
          <i className="fa-solid fa-qrcode" style={{ marginRight: 8 }} />
          Scan QR
        </Link>
      </div>

      <BookingSearchPage
        title="Search Records"
        apiPath="/api/delivery/search"
        detailHref="/jewellery-selection/{id}"
        dateLabel="Delivery Date"
        showCategoryFilter
        categories={categories}
        actionLabel="Open Record"
        actionIcon="fa-gem"
        todayIso={todayIso()}
        hint="Bookings not yet delivered appear for the selected date first, then nearby dates. Search by customer, dress, phone, or serial — same as the dashboard search. Category is optional."
      />
    </>
  );
}
