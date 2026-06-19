"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
  badge?: number;
};

export default function Sidebar({
  isOwner,
  overdueDeliveryCount,
}: {
  isOwner: boolean;
  overdueDeliveryCount: number;
}) {
  const pathname = usePathname();

  const main: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "fa-house-chimney" },
    { href: "/booking", label: "Booking Panel", icon: "fa-calendar-plus" },
    { href: "/search-booking", label: "Search Booking", icon: "fa-magnifying-glass-plus" },
    { href: "/booking-delivery", label: "Booking Delivery", icon: "fa-truck-fast" },
    {
      href: "/remaining-to-deliver",
      label: "Remaining to Deliver",
      icon: "fa-clock",
      badge: overdueDeliveryCount,
    },
    { href: "/return", label: "Return", icon: "fa-rotate-left" },
    { href: "/booking-list", label: "Booked Items", icon: "fa-list-check" },
    { href: "/packing-list", label: "Packing List", icon: "fa-boxes-packing" },
    { href: "/free-items", label: "Free Item List", icon: "fa-magnifying-glass" },
    { href: "/returning-today", label: "Alternate Booking", icon: "fa-arrows-rotate" },
    { href: "/inventory", label: "Manage Inventory", icon: "fa-layer-group" },
    { href: "/inventory/search", label: "Dress Search", icon: "fa-shirt" },
    { href: "/all-record-search", label: "All Record Search", icon: "fa-database" },
    { href: "/incomplete-return", label: "Incomplete Return", icon: "fa-circle-exclamation" },
  ];

  const finance: NavItem[] = [
    { href: "/finance/daily-sale", label: "Daily Sale", icon: "fa-coins", ownerOnly: true },
    { href: "/finance/daily-booking", label: "Daily Booking Amount", icon: "fa-receipt", ownerOnly: true },
    { href: "/finance/monthly-sale", label: "Monthly Sale", icon: "fa-calendar-days", ownerOnly: true },
    { href: "/finance/yearly-sale", label: "Yearly Sale", icon: "fa-chart-line", ownerOnly: true },
    { href: "/finance/top-performer", label: "Top Performer", icon: "fa-trophy", ownerOnly: true },
    { href: "/finance/category-analysis", label: "Category Analysis", icon: "fa-chart-pie", ownerOnly: true },
    { href: "/finance/security-deposit", label: "Security Deposit", icon: "fa-shield-halved", ownerOnly: true },
    { href: "/finance/suppliers", label: "Suppliers", icon: "fa-truck-field", ownerOnly: true },
  ];

  const other: NavItem[] = [
    { href: "/customers", label: "Customers", icon: "fa-users", ownerOnly: true },
    { href: "/staff-work", label: "Staff Work", icon: "fa-user-tie", ownerOnly: true },
    { href: "/staff-attendance", label: "Staff Attendance", icon: "fa-clipboard-check" },
    { href: "/manage-categories", label: "Manage Categories", icon: "fa-tags" },
    { href: "/recycle-bin", label: "Recycle Bin", icon: "fa-trash-can", ownerOnly: true },
    { href: "/users", label: "Manage Users", icon: "fa-user-shield", ownerOnly: true },
  ];

  const render = (items: NavItem[]) =>
    items
      .filter((i) => !i.ownerOnly || isOwner)
      .map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item${pathname === item.href ? " active" : ""}${item.badge ? " nav-item-badge" : ""}`}
        >
          <i className={`fa-solid ${item.icon}`} /> {item.label}
          {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
        </Link>
      ));

  return (
    <aside className="sidebar no-print" id="appSidebar">
      <div className="sidebar-toggle-row">
        <button type="button" className="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar">
          <i className="fa-solid fa-bars" />
        </button>
      </div>
      <div className="sidebar-brand">
        <div className="brand-icon">👑</div>
        <h1 className="sidebar-brand-text">Fancy Collection</h1>
        <span className="sidebar-brand-text">Rental Management System</span>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-label">Main Menu</div>
        {render(main)}
        {isOwner && (
          <>
            <div className="nav-section-label" style={{ marginTop: 8 }}>
              Finance
            </div>
            {render(finance)}
          </>
        )}
        <div className="nav-section-label" style={{ marginTop: 8 }}>
          Other
        </div>
        {render(other)}
        <div className="nav-section-label" style={{ marginTop: 8 }}>
          Quick Actions
        </div>
        <Link href="/booking/new" className="nav-item nav-item-action">
          <i className="fa-solid fa-plus" /> New Booking
        </Link>
      </nav>
    </aside>
  );
}
