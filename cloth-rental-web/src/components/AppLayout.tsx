import Sidebar from "@/components/Sidebar";
import SessionHeartbeat from "@/components/SessionHeartbeat";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAllCategories } from "@/lib/categories";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
  title,
  breadcrumb,
}: {
  children: React.ReactNode;
  title: string;
  breadcrumb?: string;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cats = await getAllCategories();
  let overdueDeliveryCount = 0;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    overdueDeliveryCount = await prisma.booking.count({
      where: { deliveryDate: { lt: today }, status: "booked" },
    });
  } catch {
    overdueDeliveryCount = 0;
  }

  return (
    <div className="app-layout">
      <Sidebar isOwner={user.role === "owner"} overdueDeliveryCount={overdueDeliveryCount} />
      <div className="sidebar-overlay" id="sidebarOverlay" />
      <main className="main-content">
        <header className="top-header no-print">
          <button type="button" className="mobile-menu-btn" id="mobileMenuBtn" aria-label="Open menu">
            <i className="fa-solid fa-bars" />
          </button>
          <div>
            <h2 className="page-title">{title}</h2>
            {breadcrumb ? <p className="breadcrumb">{breadcrumb}</p> : null}
          </div>
          <div className="header-user">
            <span className="user-pill">
              <i className="fa-solid fa-user" /> {user.username}
              <span className="role-tag">{user.role}</span>
            </span>
            <Link href="/profile/change-password" className="btn btn-outline btn-sm">
              <i className="fa-solid fa-key" />
            </Link>
            <Link href="/logout" className="btn btn-outline btn-sm">
              <i className="fa-solid fa-right-from-bracket" /> Logout
            </Link>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
      <SessionHeartbeat />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              var sb=document.getElementById('appSidebar');
              var ov=document.getElementById('sidebarOverlay');
              var tg=document.getElementById('sidebarToggle');
              var mb=document.getElementById('mobileMenuBtn');
              function toggle(){ sb&&sb.classList.toggle('collapsed'); document.body.classList.toggle('sidebar-collapsed'); }
              function mobile(){ sb&&sb.classList.toggle('mobile-open'); ov&&ov.classList.toggle('active'); }
              tg&&tg.addEventListener('click',toggle);
              mb&&mb.addEventListener('click',mobile);
              ov&&ov.addEventListener('click',mobile);
            })();
          `,
        }}
      />
    </div>
  );
}
