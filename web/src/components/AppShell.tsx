"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";
import { useMounted } from "@/lib/useMounted";

const NAV_MAIN = [
  { href: "/", label: "Dashboard", icon: "fa-house-chimney" },
  { href: "/booking", label: "Booking Panel", icon: "fa-calendar-plus" },
  { href: "/search-booking", label: "Search Booking", icon: "fa-magnifying-glass-plus" },
  { href: "/booking-delivery", label: "Booking Delivery", icon: "fa-truck-fast" },
  { href: "/remaining-to-deliver", label: "Remaining to Deliver", icon: "fa-clock", badgeKey: "overdue_delivery" as const },
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

const NAV_COMMON = [
  { href: "/prospect-leads", label: "Prospect & Enquiries", icon: "fa-user-clock" },
  { href: "/staff-attendance", label: "Staff Attendance", icon: "fa-clipboard-check" },
  { href: "/manage-categories", label: "Manage Categories", icon: "fa-tags" },
];

const NAV_FINANCE = [
  { href: "/finance/daily-sale", label: "Daily Sale", icon: "fa-coins" },
  { href: "/finance/daily-booking", label: "Daily Booking Amount", icon: "fa-receipt" },
  { href: "/finance/monthly-sale", label: "Monthly Sale", icon: "fa-calendar-days" },
  { href: "/finance/yearly-sale", label: "Yearly Sale", icon: "fa-chart-line" },
  { href: "/finance/top-performer", label: "Top Performer", icon: "fa-trophy" },
  { href: "/finance/category-analysis", label: "Category Analysis", icon: "fa-chart-pie" },
  { href: "/finance/security-deposit", label: "Security Deposit", icon: "fa-shield-halved" },
  { href: "/finance/suppliers", label: "Suppliers", icon: "fa-truck-field" },
];

const NAV_OWNER = [
  { href: "/customers", label: "Customers", icon: "fa-users" },
  { href: "/staff-work", label: "Staff Work", icon: "fa-user-tie" },
  { href: "/users", label: "Manage Users", icon: "fa-user-shield" },
  { href: "/recycle-bin", label: "Recycle Bin", icon: "fa-trash-can" },
  { href: "/api/admin/export/bookings", label: "Export Bookings CSV", icon: "fa-file-csv", external: true },
  { href: "/api/admin/export/inventory", label: "Export Inventory CSV", icon: "fa-file-csv", external: true },
  { href: "/admin/reset-data", label: "Reset All Data", icon: "fa-triangle-exclamation", danger: true },
];

const NAV_QUICK = [
  { href: "/booking/new", label: "New Booking", icon: "fa-plus" },
  { href: "/inventory/add", label: "Add Inventory", icon: "fa-shirt" },
];

const ALL_NAV = [...NAV_MAIN, ...NAV_COMMON, ...NAV_FINANCE, ...NAV_OWNER, ...NAV_QUICK];

function pageTitle(pathname: string) {
  const exact = ALL_NAV.find((n) => n.href === pathname);
  if (exact) return exact.label;
  if (pathname.startsWith("/search-qr")) return "Search QR Code";
  if (pathname.startsWith("/search-booking")) return "Search Booking";
  if (pathname.startsWith("/booking/new")) return "New Booking";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/edit")) return "Edit Booking";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/print")) return "Print Bill";
  if (pathname.startsWith("/booking/")) return "Booking Details";
  if (pathname.startsWith("/finance/")) return "Finance";
  if (pathname.startsWith("/inventory/")) return "Inventory";
  if (pathname.startsWith("/customers/")) return "Customer";
  if (pathname.startsWith("/profile/")) return "Profile";
  if (pathname.startsWith("/admin/")) return "Admin";
  if (pathname.startsWith("/prospect-leads")) return "Prospect & Enquiries";
  if (pathname.startsWith("/shop-enquiries")) return "Shop Enquiry";
  return "Fancy Collection";
}

export default function AppShell({
  children,
  isOwner,
  username,
  initialOverdueDelivery,
}: {
  children: ReactNode;
  isOwner: boolean;
  username: string;
  initialOverdueDelivery?: number;
}) {
  const pathname = usePathname();
  const toast = useToast();
  const mounted = useMounted();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overdueDelivery, setOverdueDelivery] = useState(initialOverdueDelivery ?? 0);
  const [navigating, setNavigating] = useState(false);
  const skipNavProgress = useRef(true);

  const title = useMemo(() => pageTitle(pathname), [pathname]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("fc_sidebar_collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("fc_sidebar_collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    document.body.classList.remove("sidebar-mobile-open");
    if (!mounted) return;
    if (skipNavProgress.current) {
      skipNavProgress.current = false;
      return;
    }
    setNavigating(true);
    const t = window.setTimeout(() => setNavigating(false), 500);
    return () => window.clearTimeout(t);
  }, [pathname, mounted]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-mobile-open", mobileOpen);
    return () => document.body.classList.remove("sidebar-mobile-open");
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function toggleMobileMenu() {
    setMobileOpen((open) => !open);
  }

  useEffect(() => {
    if (initialOverdueDelivery !== undefined) return;

    let cancelled = false;
    function loadNavCounts() {
      fetchJson<{ overdue_delivery_count: number }>("/api/dashboard/nav-counts")
        .then((d) => {
          if (!cancelled) setOverdueDelivery(d.overdue_delivery_count || 0);
        })
        .catch(() => {});
    }
    loadNavCounts();
    window.addEventListener("focus", loadNavCounts);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadNavCounts);
    };
  }, [initialOverdueDelivery]);

  useEffect(() => {
    if (initialOverdueDelivery === undefined) return;
    setOverdueDelivery(initialOverdueDelivery);
  }, [initialOverdueDelivery]);

  function toggleCollapsed() {
    setCollapsed((c) => !c);
  }

  async function handleLogout() {
    toast("Signing out…", "info");
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* still navigate away */
    }
    window.location.href = "/login";
  }

  return (
    <div className={`app-layout ${mounted && collapsed ? "sidebar-collapsed" : ""}`} suppressHydrationWarning>
      <div className={`route-progress ${mounted && navigating ? "active" : ""}`} aria-hidden>
        <div className="route-progress-bar" />
      </div>

      <div
        className={`sidebar-overlay ${mobileOpen ? "active" : ""}`}
        onClick={() => setMobileOpen(false)}
        onKeyDown={() => {}}
        role="presentation"
      />

      <aside className={`sidebar no-print ${mobileOpen ? "sidebar-open" : ""}`} id="appSidebar">
        <div className="sidebar-header-mobile no-print">
          <span className="sidebar-mobile-label">Menu</span>
          <button type="button" className="sidebar-toggle sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="sidebar-toggle-row">
          <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} aria-label="Toggle sidebar">
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
          {NAV_MAIN.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-item ${pathname === item.href ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
              <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
              {item.badgeKey === "overdue_delivery" && overdueDelivery > 0 && (
                <span className="nav-badge">{overdueDelivery}</span>
              )}
            </Link>
          ))}
          <div className="nav-section-label" style={{ marginTop: 8 }}>Other</div>
          {NAV_COMMON.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${
                pathname === item.href ||
                pathname.startsWith(item.href + "/") ||
                (item.href === "/prospect-leads" && pathname.startsWith("/shop-enquiries"))
                  ? "active"
                  : ""
              }`}
              onClick={() => setMobileOpen(false)}
            >
              <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
            </Link>
          ))}
          {isOwner && (
            <>
              <div className="nav-section-label" style={{ marginTop: 8 }}>Finance</div>
              {NAV_FINANCE.map((item) => (
                <Link key={item.href} href={item.href} className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + "/") ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                  <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
                </Link>
              ))}
              <div className="nav-section-label" style={{ marginTop: 8 }}>Admin</div>
              {NAV_OWNER.map((item) =>
                item.external ? (
                  <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="nav-item" style={item.danger ? { color: "#fc8181" } : undefined}>
                    <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
                  </a>
                ) : (
                  <Link key={item.href} href={item.href} className={`nav-item ${pathname === item.href ? "active" : ""}`} style={item.danger ? { color: "#fc8181" } : undefined} onClick={() => setMobileOpen(false)}>
                    <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
                  </Link>
                ),
              )}
            </>
          )}
          <div className="nav-section-label" style={{ marginTop: 8 }}>Quick Actions</div>
          {NAV_QUICK.filter((item) => item.href !== "/inventory/add" || isOwner).map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? "active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <i className="fa-solid fa-user" />
            <span>{username}</span>
          </div>
          <Link href="/profile/change-password" className="nav-item" style={{ marginTop: 4, fontSize: 12 }} onClick={() => setMobileOpen(false)}>
            <i className="fa-solid fa-key" /> Change Password
          </Link>
          <button
            type="button"
            className="nav-item"
            style={{ marginTop: 8, color: "#fca5a5", width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
            onClick={handleLogout}
          >
            <i className="fa-solid fa-right-from-bracket" /> <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header no-print">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button type="button" className="sidebar-toggle sidebar-mobile-toggle" onClick={toggleMobileMenu} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}>
              <i className={`fa-solid ${mobileOpen ? "fa-xmark" : "fa-bars"}`} />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 className="page-title">{title}</h1>
              <div className="breadcrumb-trail">Fancy Collection · {title}</div>
            </div>
          </div>
          <div className="header-actions">
            <a href="/booking/new" className="btn btn-primary btn-sm">
              <i className="fa-solid fa-plus" /> New Booking
            </a>
          </div>
        </header>
        <div className="page-content page-body">{children}</div>
      </main>
    </div>
  );
}
