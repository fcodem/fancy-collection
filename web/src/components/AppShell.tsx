"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, parseResponseJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";
import { useMounted } from "@/lib/useMounted";
import RealtimeProvider, { useRealtime } from "@/components/RealtimeProvider";
import { SidebarBrandMark, BrandBreadcrumbLabel, BrandLogo, BrandMottoPill } from "@/components/BrandMark";
import { BRAND_APP_TITLE } from "@/lib/branding";

const NAV_WHATSAPP = [
  { href: "/whatsapp", label: "Inbox", icon: "fa-comment-dots" },
  { href: "/whatsapp/connection", label: "Connection", icon: "fa-plug" },
  { href: "/whatsapp/broadcast", label: "Broadcast", icon: "fa-bullhorn" },
  { href: "/whatsapp/templates", label: "Templates", icon: "fa-file-lines" },
  { href: "/whatsapp/jobs", label: "Job Queue", icon: "fa-list-ul" },
];

const NAV_MAIN = [
  { href: "/", label: "Dashboard", icon: "fa-house-chimney" },
  { href: "/booking", label: "Booking Panel", icon: "fa-calendar-plus" },
  { href: "/search-booking", label: "Search Booking", icon: "fa-magnifying-glass-plus" },
  { href: "/free-items", label: "Free Item List", icon: "fa-magnifying-glass" },
  { href: "/booking-delivery", label: "Booking Delivery", icon: "fa-truck-fast" },
  { href: "/jewellery-selection", label: "Jewellery Selection", icon: "fa-gem" },
  { href: "/return", label: "Return", icon: "fa-rotate-left" },
  { href: "/packing-list", label: "Packing List", icon: "fa-boxes-packing" },
  { href: "/booking-list", label: "Booked Items", icon: "fa-list-check" },
  { href: "/returning-today", label: "Returning Today (Alternate)", icon: "fa-arrows-rotate" },
  { href: "/inventory/search", label: "Dress Search", icon: "fa-shirt" },
  { href: "/inventory", label: "Manage Inventory", icon: "fa-layer-group" },
  { href: "/search-qr", label: "Search QR Code", icon: "fa-qrcode" },
  { href: "/late-return", label: "Late Returns", icon: "fa-hourglass-end" },
  { href: "/all-record-search", label: "All Record Search", icon: "fa-database" },
  { href: "/postponed-booking", label: "Postponed Bookings", icon: "fa-clock" },
  { href: "/remaining-to-deliver", label: "Remaining to Deliver", icon: "fa-clock", badgeKey: "overdue_delivery" as const },
  { href: "/incomplete-return", label: "Incomplete Return", icon: "fa-circle-exclamation" },
];

/** All AI tools live under /ai-features — single sidebar entry at the bottom. */
const NAV_AI_FEATURES = { href: "/ai-features", label: "AI Features", icon: "fa-wand-magic-sparkles" };

const NAV_COMMON = [
  { href: "/prospect-leads", label: "Prospect & Enquiries", icon: "fa-user-clock" },
  { href: "/manage-categories", label: "Manage Categories", icon: "fa-tags" },
];

const NAV_FINANCE = [
  { href: "/finance/ledger", label: "Ledger", icon: "fa-book" },
  { href: "/finance/daily-sale", label: "Daily Sale", icon: "fa-coins" },
  { href: "/finance/daily-booking", label: "Daily Booking Amount", icon: "fa-receipt" },
  { href: "/finance/monthly-sale", label: "Monthly Sale", icon: "fa-calendar-days" },
  { href: "/finance/yearly-sale", label: "Yearly Sale", icon: "fa-chart-line" },
  { href: "/finance/top-performer", label: "Top Performer", icon: "fa-trophy" },
  { href: "/finance/inventory-profitability", label: "Inventory Profitability", icon: "fa-chart-column" },
  { href: "/finance/category-analysis", label: "Category Analysis", icon: "fa-chart-pie" },
  { href: "/finance/security-deposit", label: "Security Deposit", icon: "fa-shield-halved" },
  { href: "/finance/suppliers", label: "Suppliers", icon: "fa-truck-field" },
];

const NAV_OWNER = [
  { href: "/admin/calendar", label: "Booking Calendar", icon: "fa-calendar-days" },
  { href: "/customers", label: "Customers", icon: "fa-users" },
  { href: "/staff-attendance", label: "Staff Attendance", icon: "fa-clipboard-check" },
  { href: "/staff-work", label: "Staff Work", icon: "fa-user-tie" },
  { href: "/users", label: "Manage Users", icon: "fa-user-shield" },
  { href: "/activity-log", label: "Activity Log", icon: "fa-clock-rotate-left" },
  { href: "/recycle-bin", label: "Recycle Bin", icon: "fa-trash-can" },
  { href: "/reports", label: "Reports & Backup", icon: "fa-file-export" },
  { href: "/admin/restore", label: "Restore Database", icon: "fa-upload" },
  { href: "/admin/image-sync", label: "Bulk Image Sync", icon: "fa-images" },
  { href: "/admin/reset-data", label: "Reset All Data", icon: "fa-triangle-exclamation", danger: true },
];

const NAV_QUICK = [
  { href: "/booking/new", label: "New Booking", icon: "fa-plus" },
  { href: "/inventory/add", label: "Add Inventory", icon: "fa-shirt" },
];

const ALL_NAV = [
  ...NAV_MAIN,
  ...NAV_COMMON,
  ...NAV_FINANCE,
  ...NAV_OWNER,
  ...NAV_QUICK,
  ...NAV_WHATSAPP,
  NAV_AI_FEATURES,
];

function pageTitle(pathname: string) {
  const exact = ALL_NAV.find((n) => n.href === pathname);
  if (exact) return exact.label;
  if (pathname.startsWith("/ai-features")) return "AI Features";
  if (pathname.startsWith("/search-qr")) return "Search QR Code";
  if (pathname.startsWith("/late-return")) return "Late Returns";
  if (pathname.startsWith("/ai-tools/image-enhancer")) return "AI Enhancer";
  if (pathname.startsWith("/ai-tools/catalog-generator")) return "AI Catalog Generator";
  if (pathname.startsWith("/booking-assistant")) return "AI Booking Assistant";
  if (pathname.startsWith("/admin/ai-indexing")) return "AI Indexing Health";
  if (pathname.startsWith("/admin/recognition/diagnostics")) return "AI Diagnostics";
  if (pathname.startsWith("/admin/recognition")) return "AI Recognition";
  if (pathname.startsWith("/admin/dress-checker-debug")) return "Dress Checker Scores";
  if (pathname.startsWith("/admin/ai-debug")) return "AI Dress Checker Debug";
  if (pathname.startsWith("/admin/ai-settings")) return "AI Settings";
  if (pathname.startsWith("/search-booking")) return "Search Booking";
  if (pathname.startsWith("/booking/new")) return "New Booking";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/edit")) return "Edit Booking";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/customer-slips")) return "Customer Slips";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/delivery-slip")) return "Delivery Slip";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/return-slip")) return "Return Slip";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/incomplete-slip")) return "Incomplete Slip";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/slip")) return "Booking Slip";
  if (pathname.startsWith("/booking/") && pathname.endsWith("/print")) return "Booking Slip";
  if (pathname.startsWith("/booking/")) return "Booking Details";
  if (pathname.startsWith("/postponed-booking")) return "Postponed Booking";
  if (pathname.startsWith("/jewellery-selection")) return "Jewellery Selection";
  if (pathname.startsWith("/finance/")) return "Finance";
  if (pathname.startsWith("/inventory/")) return "Inventory";
  if (pathname.startsWith("/customers/")) return "Customer";
  if (pathname.startsWith("/profile/")) return "Profile";
  if (pathname.startsWith("/admin/")) return "Admin";
  if (pathname.startsWith("/prospect-leads")) return "Prospect & Enquiries";
  if (pathname.startsWith("/shop-enquiries")) return "Shop Enquiry";
  if (pathname.startsWith("/whatsapp")) return "WhatsApp";
  if (pathname.startsWith("/ai-dashboard")) return "AI Mode";
  return BRAND_APP_TITLE;
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
  const [whatsappUnread, setWhatsappUnread] = useState(0);
  const [aiHealthBanner, setAiHealthBanner] = useState<string | null>(null);
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
    let cancelled = false;
    let lastFetch = 0;
    function loadNavCounts(force = false) {
      const now = Date.now();
      if (!force && now - lastFetch < 60_000) return;
      lastFetch = now;
      fetchJson<{ overdue_delivery_count: number }>("/api/dashboard/nav-counts", {
        dedupeMs: 60_000,
      })
        .then((d) => {
          if (!cancelled) setOverdueDelivery(d.overdue_delivery_count || 0);
        })
        .catch(() => {});
    }
    loadNavCounts(true);
    // Focus refresh is rate-limited by the 60s client window.
    function onFocus() {
      loadNavCounts(false);
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    function loadWhatsappUnread() {
      fetch("/api/whatsapp/conversations")
        .then((r) => parseResponseJson<{ conversations?: Array<{ unreadCount: number }> }>(r))
        .then((d: { conversations?: Array<{ unreadCount: number }> }) => {
          if (!cancelled) {
            const total = (d.conversations || []).reduce(
              (sum: number, c: { unreadCount: number }) => sum + (c.unreadCount || 0),
              0,
            );
            setWhatsappUnread(total);
          }
        })
        .catch(() => {});
    }
    function loadWhatsappUnreadIfVisible() {
      if (document.hidden) return;
      loadWhatsappUnread();
    }
    loadWhatsappUnreadIfVisible();
    const interval = setInterval(loadWhatsappUnreadIfVisible, 120_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    function loadAiHealth() {
      fetch("/api/health")
        .then((r) => parseResponseJson<{ banner?: string | null; worker?: { status?: string; displayLabel?: string } }>(r))
        .then((d) => {
          if (cancelled) return;
          if (d.worker?.status === "OFFLINE") {
            setAiHealthBanner(d.worker.displayLabel || "Queue worker offline.");
          } else if (d.banner) {
            setAiHealthBanner(d.banner);
          } else {
            setAiHealthBanner(null);
          }
        })
        .catch(() => {
          if (!cancelled) setAiHealthBanner(null);
        });
    }
    function loadIfVisible() {
      if (document.hidden) return;
      loadAiHealth();
    }
    loadIfVisible();
    const interval = setInterval(loadIfVisible, 180_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOwner]);

  useEffect(() => {
    function onRealtimeToast(e: Event) {
      const detail = (e as CustomEvent<{ message: string; type: "info" | "success" | "error" }>).detail;
      if (detail?.message) toast(detail.message, detail.type || "info");
    }
    window.addEventListener("shop-realtime-toast", onRealtimeToast);
    return () => window.removeEventListener("shop-realtime-toast", onRealtimeToast);
  }, [toast]);

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
    <RealtimeProvider username={username} onNavRefresh={setOverdueDelivery}>
      <AppLayoutInner
        mounted={mounted}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        navigating={navigating}
        pathname={pathname}
        title={title}
        isOwner={isOwner}
        username={username}
        overdueDelivery={overdueDelivery}
        whatsappUnread={whatsappUnread}
        aiHealthBanner={aiHealthBanner}
        onToggleCollapsed={toggleCollapsed}
        onToggleMobile={toggleMobileMenu}
        onCloseMobile={() => setMobileOpen(false)}
        onLogout={handleLogout}
      >
        {children}
      </AppLayoutInner>
    </RealtimeProvider>
  );
}

function OnlineIndicator() {
  const { onlineUsers } = useRealtime();
  if (onlineUsers < 2) return null;
  return (
    <span
      title={`${onlineUsers} staff connected — changes sync live`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "var(--success)",
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 20,
        background: "rgba(46,125,50,0.08)",
        border: "1px solid rgba(46,125,50,0.2)",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
      {onlineUsers} online
    </span>
  );
}

function AppLayoutInner({
  children,
  mounted,
  collapsed,
  mobileOpen,
  navigating,
  pathname,
  title,
  isOwner,
  username,
  overdueDelivery,
  whatsappUnread,
  aiHealthBanner,
  onToggleCollapsed,
  onToggleMobile,
  onCloseMobile,
  onLogout,
}: {
  children: ReactNode;
  mounted: boolean;
  collapsed: boolean;
  mobileOpen: boolean;
  navigating: boolean;
  pathname: string;
  title: string;
  isOwner: boolean;
  username: string;
  overdueDelivery: number;
  whatsappUnread: number;
  aiHealthBanner: string | null;
  onToggleCollapsed: () => void;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
  onLogout: () => void;
}) {
  return (
    <div className={`app-layout ${mounted && collapsed ? "sidebar-collapsed" : ""}`} suppressHydrationWarning>
      <div className={`route-progress ${mounted && navigating ? "active" : ""}`} aria-hidden>
        <div className="route-progress-bar" />
      </div>

      <div
        className={`sidebar-overlay ${mobileOpen ? "active" : ""}`}
        onClick={onCloseMobile}
        onKeyDown={() => {}}
        role="presentation"
      />

      <aside className={`sidebar no-print ${mobileOpen ? "sidebar-open" : ""}`} id="appSidebar">
        <div className="sidebar-header-mobile no-print">
          <span className="sidebar-mobile-label">Menu</span>
          <button type="button" className="sidebar-toggle sidebar-mobile-close" onClick={onCloseMobile} aria-label="Close menu">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="sidebar-toggle-row">
          <button type="button" className="sidebar-toggle" onClick={onToggleCollapsed} aria-label="Toggle sidebar">
            <i className="fa-solid fa-bars" />
          </button>
        </div>
        <SidebarBrandMark />
        <nav className="sidebar-nav">
          <div className="nav-section-label">Main Menu</div>
          {NAV_MAIN.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-item ${pathname === item.href ? "active" : ""}`} onClick={onCloseMobile}>
              <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
              {item.badgeKey === "overdue_delivery" && overdueDelivery > 0 && (
                <span className="nav-badge">{overdueDelivery}</span>
              )}
            </Link>
          ))}
          <div className="nav-section-label" style={{ marginTop: 8 }}>Other</div>
          {NAV_COMMON.filter((item) => isOwner || item.href !== "/manage-categories").map((item) => (
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
              onClick={onCloseMobile}
            >
              <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
            </Link>
          ))}
          {isOwner && (
            <>
              <div className="nav-section-label" style={{ marginTop: 8 }}>Finance</div>
              {NAV_FINANCE.map((item) => (
                <Link key={item.href} href={item.href} className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + "/") ? "active" : ""}`} onClick={onCloseMobile}>
                  <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
                </Link>
              ))}
              <div className="nav-section-label" style={{ marginTop: 8 }}>Admin</div>
              {NAV_OWNER.map((item) => (
                <Link key={item.href} href={item.href} className={`nav-item ${pathname === item.href ? "active" : ""}`} style={item.danger ? { color: "#fc8181" } : undefined} onClick={onCloseMobile}>
                  <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
                </Link>
              ))}
              <div className="nav-section-label" style={{ marginTop: 8 }}>WhatsApp</div>
              {NAV_WHATSAPP.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + "/") ? "active" : ""}`}
                  onClick={onCloseMobile}
                >
                  <i className={`fa-solid ${item.icon}`} />
                  <span className="nav-label">{item.label}</span>
                  {item.href === "/whatsapp" && whatsappUnread > 0 && (
                    <span className="nav-badge" style={{ background: "#16a34a" }}>{whatsappUnread}</span>
                  )}
                </Link>
              ))}
            </>
          )}
          <div className="nav-section-label" style={{ marginTop: 8 }}>Quick Actions</div>
          {NAV_QUICK.filter((item) => item.href !== "/inventory/add" || isOwner).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`nav-item ${pathname === item.href ? "active" : ""}`}
              onClick={onCloseMobile}
            >
              <i className={`fa-solid ${item.icon}`} /> <span className="nav-label">{item.label}</span>
            </Link>
          ))}
          <div className="nav-section-label" style={{ marginTop: 8 }}>AI</div>
          <Link
            href={NAV_AI_FEATURES.href}
            className={`nav-item ${
              pathname === NAV_AI_FEATURES.href ||
              pathname.startsWith("/ai-features") ||
              pathname.startsWith("/ai-dashboard") ||
              pathname.startsWith("/booking-assistant") ||
              pathname.startsWith("/admin/ai-") ||
              pathname.startsWith("/admin/recognition") ||
              pathname.startsWith("/admin/dress-checker-debug") ||
              pathname.startsWith("/ai-tools/")
                ? "active"
                : ""
            }`}
            onClick={onCloseMobile}
          >
            <i className={`fa-solid ${NAV_AI_FEATURES.icon}`} />{" "}
            <span className="nav-label">{NAV_AI_FEATURES.label}</span>
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <i className="fa-solid fa-user" />
            <span>{username}</span>
          </div>
          <Link href="/profile/change-password" className="nav-item" style={{ marginTop: 4, fontSize: 12 }} onClick={onCloseMobile}>
            <i className="fa-solid fa-key" /> Change Password
          </Link>
          <button
            type="button"
            className="nav-item"
            style={{ marginTop: 8, color: "#fca5a5", width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
            onClick={onLogout}
          >
            <i className="fa-solid fa-right-from-bracket" /> <span className="nav-label">Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header no-print">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button type="button" className="sidebar-toggle sidebar-mobile-toggle" onClick={onToggleMobile} aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen}>
              <i className={`fa-solid ${mobileOpen ? "fa-xmark" : "fa-bars"}`} />
            </button>
            <BrandLogo size={36} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <h1 className="page-title">{title}</h1>
              <div className="breadcrumb-trail">
                <BrandBreadcrumbLabel />
                <span className="brand-breadcrumb-dot"> · </span>
                {title}
              </div>
              <div style={{ marginTop: 4 }}>
                <BrandMottoPill dark={false} />
              </div>
            </div>
          </div>
          <div className="header-actions">
            <OnlineIndicator />
            <Link href="/booking/new" prefetch className="btn btn-primary btn-sm">
              <i className="fa-solid fa-plus" /> New Booking
            </Link>
          </div>
        </header>
        {isOwner && aiHealthBanner && (
          <div
            role="alert"
            className="no-print"
            style={{
              margin: "0 16px 8px",
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(180, 83, 9, 0.12)",
              border: "1px solid rgba(180, 83, 9, 0.35)",
              color: "#92400e",
              fontWeight: 600,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>⚠ {aiHealthBanner}</span>
            <Link href="/ai-features" style={{ color: "#7B1F45", fontWeight: 700, whiteSpace: "nowrap" }}>
              Open AI Features →
            </Link>
          </div>
        )}
        <div className="page-content page-body">{children}</div>
      </main>
    </div>
  );
}
