import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AppLayout from "@/components/AppLayout";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppLayout title="Admin Tools" breadcrumb="Calendar & media utilities">
      <nav
        className="no-print"
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <Link href="/admin/calendar" className="btn btn-outline btn-sm">
          <i className="fa-solid fa-calendar-days" style={{ marginRight: 6 }} />
          Booking Calendar
        </Link>
        <Link href="/admin/image-sync" className="btn btn-outline btn-sm">
          <i className="fa-solid fa-images" style={{ marginRight: 6 }} />
          Bulk Image Sync
        </Link>
      </nav>
      {children}
    </AppLayout>
  );
}
