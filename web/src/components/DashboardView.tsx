"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import ScanDressAvailabilityCard from "@/components/ScanDressAvailabilityCard";
import { formatDate } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import { fetchJson, parseResponseJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/Toast";
import { BookingNotesBlock } from "@/components/BookingNotesBlock";
import StarBookingBadge from "@/components/StarBookingBadge";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS } from "@/lib/realtime/types";
import type { SerializedDashboardData } from "@/lib/services/core";

type BookingRow = {
  id: number;
  customerName: string;
  deliveryTime?: string;
  returnTime?: string;
  status: string;
  dressName?: string | null;
  notes?: string | null;
  commonNotes?: string | null;
  customerAddress?: string | null;
  totalPrice?: number;
  securityDeposit?: number;
  venue?: string | null;
  contact1?: string;
  totalRemaining?: number;
  remaining?: number;
  monthlySerial?: number;
  deliveryDate: string | Date;
  returnDate?: string | Date;
  bookingItems: Array<{ dressName: string; category?: string | null; size?: string | null; notes?: string | null }>;
};
type DashboardProps = {
  data: SerializedDashboardData;
  isOwner: boolean;
  pendingStaff: Array<{ id: number; username: string; staffName: string; requestedAt?: string }>;
  activeStaff: Array<{ id: number; username: string; staffName: string; loginAt?: string }>;
  showBusinessSummary?: boolean;
  showOrdersDueCard?: boolean;
};

const STAT_LIST_HREF = {
  totalOrders: "/dashboard/stats/total-orders",
  delivered: "/dashboard/stats/delivered-today",
  remaining: "/dashboard/stats/remaining-to-deliver",
  returning: "/dashboard/stats/returning-today",
} as const;

function bookingDateLabel(d: string | Date) {
  const iso = typeof d === "string" ? d.slice(0, 10) : formatDate(d, "iso");
  return formatDate(iso, "display");
}

type DressCheckerItem = {
  id: number;
  name: string;
  display_name: string;
  category: string;
  size: string;
  status: string;
  reason: string;
  blocking_booking?: Record<string, unknown> | null;
  booked_warning?: Record<string, unknown> | null;
  returning_warning?: Record<string, unknown> | null;
};

type DressCheckerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "results"; dressName: string; items: DressCheckerItem[] };

function DressCheckerBookingInfo({
  booking,
  label,
}: {
  booking: Record<string, unknown>;
  label: string;
}) {
  return (
    <div style={{ marginTop: 8, fontSize: 12, padding: "6px 10px",
      background: "var(--bg-warning-soft, #fff8e1)", borderRadius: 4 }}>
      <strong>{label}:</strong>{" "}
      {String(booking.customer || "")}
      {booking.serial_no ? ` #${String(booking.serial_no).padStart(2, "0")}` : ""}
      {booking.delivery_date ? ` · Del: ${booking.delivery_date}` : ""}
      {booking.return_date ? ` · Ret: ${booking.return_date}` : ""}
    </div>
  );
}

function serialLabel(n: number) {
  return String(n || 0).padStart(2, "0");
}

export default function DashboardView({
  data: initialData,
  isOwner,
  pendingStaff,
  activeStaff,
  showBusinessSummary = true,
  showOrdersDueCard = true,
}: DashboardProps) {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const showFreePanelRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const [showDressChecker, setShowDressChecker] = useState(false);
  const [showFreePanel, setShowFreePanel] = useState(false);
  const [dashQuery, setDashQuery] = useState("");
  const [dashResults, setDashResults] = useState<Array<Record<string, unknown>>>([]);
  const [dashSearchMode, setDashSearchMode] = useState<string>("");
  const [showDashResults, setShowDashResults] = useState(false);

  const [dcDelivery, setDcDelivery] = useState(data.today_iso);
  const [dcReturn, setDcReturn] = useState(data.today_iso);
  const [dcDress, setDcDress] = useState("");
  const [dcCategory, setDcCategory] = useState("");
  const [dcState, setDcState] = useState<DressCheckerState>({ kind: "idle" });

  const [fiDelivery, setFiDelivery] = useState(data.today_iso);
  const [fiReturn, setFiReturn] = useState(data.today_iso);
  const [fiCategory, setFiCategory] = useState("");
  const [fiSubCategory, setFiSubCategory] = useState("");
  const [fiSubCategories, setFiSubCategories] = useState<string[]>([]);
  const [fiData, setFiData] = useState<{
    free_items: Array<Record<string, unknown>>;
    returning_on_delivery: Array<Record<string, unknown>>;
    warnings?: Record<string, Record<string, unknown>>;
  } | null>(null);
  const [freeItemCount, setFreeItemCount] = useState("Search");

  const allCats = [...data.categories.mens, ...data.categories.womens, ...data.categories.jewellery, ...data.categories.accessory];

  useEffect(() => {
    if (!fiCategory) { setFiSubCategories([]); setFiSubCategory(""); return; }
    let cancelled = false;
    void fetch(`/api/items/sub-categories?category=${encodeURIComponent(fiCategory)}`, { credentials: "same-origin" })
      .then((res) => res.ok ? res.json() : { subCategories: [] })
      .then((json: { subCategories?: string[] }) => {
        if (!cancelled) setFiSubCategories(json.subCategories ?? []);
      })
      .catch(() => { if (!cancelled) setFiSubCategories([]); });
    setFiSubCategory("");
    return () => { cancelled = true; };
  }, [fiCategory]);

  async function approveStaff(id: number) {
    try {
      await fetchJson(`/api/staff-login-request/${id}/approve`, { method: "POST" });
      toast("Staff login approved", "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function rejectStaff(id: number) {
    try {
      await fetchJson(`/api/staff-login-request/${id}/reject`, { method: "POST" });
      toast("Request denied", "info");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function forceLogout(id: number, username: string) {
    if (!window.confirm(`Log out staff ID "${username}" immediately?`)) return;
    try {
      await fetchJson(`/api/staff-session/${id}/force-logout`, { method: "POST" });
      toast("Staff logged out", "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  const searchFreeItems = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dashboard/free-items?delivery_date=${fiDelivery}&return_date=${fiReturn}&category=${encodeURIComponent(fiCategory)}&sub_category=${encodeURIComponent(fiSubCategory)}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) return;
      const json = await parseResponseJson<{
        free_items?: Array<Record<string, unknown>>;
        returning_on_delivery?: Array<Record<string, unknown>>;
        warnings?: Record<string, Record<string, unknown>>;
      }>(res);
      setFiData({
        free_items: json.free_items ?? [],
        returning_on_delivery: json.returning_on_delivery ?? [],
        warnings: json.warnings,
      });
      setFreeItemCount(`${(json.free_items || []).length} free items`);
    } catch {
      /* ignore transient network errors */
    }
  }, [fiDelivery, fiReturn, fiCategory]);

  useEffect(() => {
    showFreePanelRef.current = showFreePanel;
  }, [showFreePanel]);

  const refreshDashboard = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      refreshTimerRef.current = null;
      try {
        const fresh = await fetchJson<DashboardProps["data"]>("/api/dashboard/data");
        setData(fresh);
        if (showFreePanelRef.current) {
          searchFreeItems();
        }
      } catch {
        /* ignore transient network errors */
      }
    }, 350);
  }, [searchFreeItems]);

  useRealtimeRefresh([...BOOKING_EVENTS, ...INVENTORY_EVENTS], refreshDashboard);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showFreePanel) searchFreeItems();
  }, [showFreePanel, searchFreeItems]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = dashQuery.trim();
      const isSerial = /^\d+$/.test(q);
      if (!q || (!isSerial && q.length < 2)) {
        setDashResults([]);
        setDashSearchMode("");
        setShowDashResults(false);
        return;
      }
      try {
        const json = await fetchJson<{ mode?: string; results?: Array<Record<string, unknown>> }>(
          `/api/dashboard/search?date=${data.today_iso}&q=${encodeURIComponent(q)}`
        );
        setDashResults(Array.isArray(json.results) ? json.results.slice(0, 12) : []);
        setDashSearchMode(json.mode || "");
        setShowDashResults(true);
      } catch {
        setDashResults([]);
        setShowDashResults(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [dashQuery, data.today_iso]);

  async function runDressChecker() {
    if (!dcDress.trim()) {
      setDcState({ kind: "warning", message: "Please enter a dress name to check." });
      return;
    }
    setDcState({ kind: "loading" });
    const url = `/api/dress-checker?delivery_date=${dcDelivery}&return_date=${dcReturn}&dress_name=${encodeURIComponent(dcDress)}&category=${encodeURIComponent(dcCategory)}`;
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      const json = await parseResponseJson<{
        error?: string;
        items?: DressCheckerItem[];
        message?: string;
        dress_name?: string;
      }>(res);
      if (json.error) {
        setDcState({ kind: "error", message: json.error });
        return;
      }
      if (!json.items?.length) {
        setDcState({ kind: "warning", message: json.message || "No matching dress found." });
        return;
      }
      setDcState({ kind: "results", dressName: json.dress_name ?? "", items: json.items });
    } catch {
      setDcState({ kind: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }

  return (
    <div>
      {isOwner && activeStaff.length > 0 && (
        <div className="card" style={{ marginBottom: 20, border: "2px solid var(--success)" }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: "var(--success)" }}>
              <i className="fa-solid fa-users-gear" style={{ marginRight: 8 }} />Staff Currently Logged In
            </h3>
          </div>
          <div className="card-body p-0">
            {activeStaff.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>Login ID: <span style={{ color: "var(--primary)" }}>{s.username}</span></div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.staffName}</div>
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => forceLogout(s.id, s.username)}>
                  <i className="fa-solid fa-right-from-bracket" /> Log Out Staff
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && pendingStaff.length > 0 && (
        <div className="card" style={{ marginBottom: 20, border: "2px solid var(--gold)" }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: "var(--gold-dark)" }}>
              <i className="fa-solid fa-user-shield" style={{ marginRight: 8 }} />Staff Login Requests
            </h3>
          </div>
          <div className="card-body p-0">
            {pendingStaff.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.username}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.staffName}</div>
                </div>
                <span>
                  <button type="button" className="btn btn-sm btn-success" style={{ marginRight: 8 }} onClick={() => approveStaff(p.id)}>Allow Login</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => rejectStaff(p.id)}>Deny</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20, overflow: "visible" }}>
        <div className="card-body" style={{ padding: "14px 20px", overflow: "visible" }}>
          <div
            className="dashboard-search-row"
            style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", position: "relative", zIndex: 30 }}
          >
            <i className="fa-solid fa-magnifying-glass" style={{ color: "var(--primary)", fontSize: 18 }} />
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <DressNameSuggestInput
                type="text"
                className="form-control"
                placeholder="Quick search: Customer name, serial no, phone, dress name..."
                value={dashQuery}
                suggestions={false}
                onChange={(e) => setDashQuery(e.target.value)}
                onFocus={() => {
                  if (dashResults.length > 0) setShowDashResults(true);
                }}
                onBlur={() => setTimeout(() => setShowDashResults(false), 250)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setShowDashResults(true);
                }}
                style={{ width: "100%", fontSize: 15 }}
                minChars={2}
              />
            </div>
            <Link href="/search-booking" className="btn btn-outline btn-sm">Advanced Search</Link>
            <Link href="/search-qr" className="btn btn-gold btn-sm">
              <i className="fa-solid fa-qrcode" style={{ marginRight: 6 }} />Search QR Code
            </Link>
          </div>
          {showDashResults && dashResults.length > 0 && (
            <div style={{ marginTop: 12, maxHeight: 360, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              {dashSearchMode && (
                <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", background: "var(--cream-dark)" }}>
                  {dashSearchMode === "serial" && "Serial number — booked & delivered only"}
                  {dashSearchMode === "customer" && "Customer name — booked & delivered only"}
                  {dashSearchMode === "phone" && "Phone / WhatsApp — booked & delivered only"}
                  {dashSearchMode === "dress" && "Dress name — booked & delivered only"}
                  {dashSearchMode === "mixed" && "Matches — booked & delivered only"}
                </div>
              )}
              {dashResults.map((b) => (
                <Link
                  key={String(b.id)}
                  href={`/booking/${b.id}`}
                  style={{ display: "block", padding: "10px 12px", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {String(b.serial || 0).padStart(2, "0")}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center" }}>
                        {String(b.customer_name)}
                        {Boolean(b.is_star) && <StarBookingBadge />}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", wordBreak: "break-word" }}>
                        {String(b.dress_names || "")}
                        {(b.contact_1 as string) ? ` · ${b.contact_1}` : ""}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 4, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <span><i className="fa-solid fa-truck" style={{ marginRight: 4 }} />{String(b.delivery_date)} {String(b.delivery_time || "")}</span>
                        <span><i className="fa-solid fa-rotate-left" style={{ marginRight: 4 }} />{String(b.return_date)} {String(b.return_time || "")}</span>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>₹{formatInr(Number(b.total_rent || b.total_price || 0))}</span>
                        {Number(b.security_deposit) > 0 && (
                          <span>Sec ₹{formatInr(Number(b.security_deposit))}</span>
                        )}
                      </div>
                      {(b.item_notes as string) || (b.common_notes as string) ? (
                        <BookingNotesBlock
                          itemNotes={String(b.item_notes || "")}
                          commonNotes={String(b.common_notes || "")}
                          compact
                        />
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {showDashResults && dashQuery.trim().length >= (/^\d+$/.test(dashQuery.trim()) ? 1 : 2) && dashResults.length === 0 && (
            <div style={{ marginTop: 12, padding: 12, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No matching bookings found.
            </div>
          )}
        </div>
      </div>

      <ScanDressAvailabilityCard />

      <div className="page-banner" style={{ marginBottom: 22, background: "linear-gradient(135deg, var(--primary-dark), var(--primary))", borderRadius: "var(--radius)", padding: "18px 26px", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 52, height: 52, background: "rgba(255,255,255,0.15)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
            <i className="fa-solid fa-calendar-day" />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "Playfair Display, serif" }}>{data.today_display}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Today&apos;s Schedule</div>
          </div>
        </div>
        <div className="page-banner-actions no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "none" }} onClick={() => window.print()}>
            <i className="fa-solid fa-print" /> Print
          </button>
          <Link href="/booking/new" className="btn btn-gold"><i className="fa-solid fa-plus" /> New Booking</Link>
          <Link href="/booking" className="btn" style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1.5px solid rgba(255,255,255,0.4)" }}>
            <i className="fa-solid fa-list" /> All Bookings
          </Link>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <Link href={STAT_LIST_HREF.totalOrders} className="stat-card primary" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div className="stat-icon"><i className="fa-solid fa-clipboard-list" /></div>
          <div className="stat-value">{data.today_stats.total_orders}</div>
          <div className="stat-label">Today&apos;s Total Orders</div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>Click to open list</div>
        </Link>
        <Link href={STAT_LIST_HREF.delivered} className="stat-card success" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div className="stat-icon"><i className="fa-solid fa-truck-fast" /></div>
          <div className="stat-value">{data.today_stats.delivered}</div>
          <div className="stat-label">Delivered Today</div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>Click to open list</div>
        </Link>
        <Link href={STAT_LIST_HREF.remaining} className="stat-card warning" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div className="stat-icon"><i className="fa-solid fa-clock" /></div>
          <div className="stat-value">{data.today_stats.all_undelivered}</div>
          <div className="stat-label">Remaining to Deliver</div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>Today: {data.today_stats.remaining_delivery} · Click to open</div>
        </Link>
        <Link href={STAT_LIST_HREF.returning} className="stat-card info" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
          <div className="stat-icon"><i className="fa-solid fa-rotate-left" /></div>
          <div className="stat-value">{data.today_stats.returning}</div>
          <div className="stat-label">Returning Today</div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>Click to open list</div>
        </Link>
        <Link href="/late-return" className="stat-card" style={{ textDecoration: "none", background: "linear-gradient(135deg,#dc3545,#c0392b)", color: "white" }}>
          <div className="stat-icon" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}><i className="fa-solid fa-triangle-exclamation" /></div>
          <div className="stat-value">{data.late_return_count}</div>
          <div className="stat-label">Late Returns</div>
        </Link>
        {showOrdersDueCard && (
          <Link href="/orders" className="stat-card" style={{ textDecoration: "none", background: "linear-gradient(135deg,#b8860b,#8a6d1a)", color: "white" }}>
            <div className="stat-icon" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}><i className="fa-solid fa-scissors" /></div>
            <div className="stat-value">{data.orders_due_soon_count}</div>
            <div className="stat-label">Orders Due (3 days)</div>
            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4 }}>Click to open list</div>
          </Link>
        )}
      </div>

      <div style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-gold btn-lg" onClick={() => { setShowDressChecker(true); setShowFreePanel(false); }}>
          <i className="fa-solid fa-shirt" style={{ marginRight: 10 }} /> Dress Checker
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => { setShowFreePanel(true); setShowDressChecker(false); }}>
          <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 10 }} /> Free Item List
          <span style={{ marginLeft: 10, background: "rgba(255,255,255,0.25)", padding: "3px 10px", borderRadius: 20, fontSize: 12 }}>{freeItemCount}</span>
        </button>
      </div>

      {showDressChecker && (
        <div className="card" style={{ marginBottom: 24, border: "2px solid var(--gold)" }}>
          <div className="card-header">
            <h3 className="card-title">Dress Checker</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowDressChecker(false)}>Close</button>
          </div>
          <div className="card-body">
            <div className="filter-grid-5" style={{ marginBottom: 16 }}>
              <div><label className="form-label">Delivery Date</label><input type="date" className="form-control" value={dcDelivery} onChange={(e) => setDcDelivery(e.target.value)} /></div>
              <div><label className="form-label">Return Date</label><input type="date" className="form-control" value={dcReturn} onChange={(e) => setDcReturn(e.target.value)} /></div>
              <div><label className="form-label">Category</label>
                <select className="form-control" id="dcCategory" value={dcCategory} onChange={(e) => setDcCategory(e.target.value)}>
                  <option value="">All</option>
                  {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }} className="filter-span-2">
                <label className="form-label">Dress Name</label>
                <DressNameSuggestInput
                  id="dcDressName"
                  categorySelect="#dcCategory"
                  value={dcDress}
                  onChange={(e) => setDcDress(e.target.value)}
                  onSuggestSelect={(item) => setDcDress(item.name)}
                  placeholder="Enter dress name…"
                  showPhotos
                />
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={runDressChecker}><i className="fa-solid fa-check" /> Check Availability</button>
            <div style={{ marginTop: 16 }}>
              {dcState.kind === "loading" && (
                <div style={{ textAlign: "center", padding: "24px" }}>Checking…</div>
              )}
              {dcState.kind === "error" && (
                <div className="alert alert-error">{dcState.message}</div>
              )}
              {dcState.kind === "warning" && (
                <div className="alert alert-warning">{dcState.message}</div>
              )}
              {dcState.kind === "results" && (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 12 }}>
                    <strong>{dcState.items.length}</strong> result(s) for{" "}
                    <strong>{dcState.dressName}</strong>
                  </div>
                  {dcState.items.map((item) => {
                    const badge =
                      item.status === "available" ? (
                        <span className="badge badge-available">Free</span>
                      ) : item.status === "available_with_warning" ? (
                        <span className="badge badge-warning">Available with Warning</span>
                      ) : (
                        <span className="badge badge-overdue">Not Available</span>
                      );
                    return (
                      <div key={item.id} className="card" style={{ marginBottom: 12, padding: "14px 18px" }}>
                        <strong>{item.display_name || item.name}</strong> {badge}
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                          {item.category}
                          {item.size ? ` · Size ${item.size}` : ""} · {item.reason}
                        </div>
                        {item.blocking_booking && (
                          <DressCheckerBookingInfo
                            booking={item.blocking_booking}
                            label="Currently booked"
                          />
                        )}
                        {item.booked_warning && (
                          <DressCheckerBookingInfo
                            booking={item.booked_warning}
                            label="Booked on your return date"
                          />
                        )}
                        {item.returning_warning && (
                          <DressCheckerBookingInfo
                            booking={item.returning_warning}
                            label="Returning on your delivery date"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFreePanel && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <h3 className="card-title">Free Item List</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowFreePanel(false)}>Close</button>
          </div>
          <div className="card-body">
            <div className="filter-grid-5" style={{ marginBottom: 16 }}>
              <div><label className="form-label">Pickup</label><input type="date" className="form-control" value={fiDelivery} onChange={(e) => setFiDelivery(e.target.value)} /></div>
              <div><label className="form-label">Return</label><input type="date" className="form-control" value={fiReturn} onChange={(e) => setFiReturn(e.target.value)} /></div>
              <div><label className="form-label">Category</label>
                <select className="form-control" value={fiCategory} onChange={(e) => setFiCategory(e.target.value)}>
                  <option value="">All</option>
                  {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {fiSubCategories.length > 0 && (
                <div><label className="form-label">Sub Category</label>
                  <select className="form-control" value={fiSubCategory} onChange={(e) => setFiSubCategory(e.target.value)}>
                    <option value="">All</option>
                    {fiSubCategories.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "flex-end" }}><button type="button" className="btn btn-primary" onClick={searchFreeItems}>Search</button></div>
            </div>
            {fiData && (
              <>
                {fiData.free_items.length > 0 ? (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead><tr><th>#</th><th>Dress</th><th>Category</th><th>Sub Category</th><th>Color</th><th>Size</th><th>Status</th></tr></thead>
                      <tbody>
                        {fiData.free_items.map((item, i) => (
                          <tr key={String(item.id)} style={fiData.warnings?.[String(item.id)] ? { background: "#FFF8E1" } : undefined}>
                            <td>{i + 1}</td>
                            <td><strong>{String(item.display_name || item.name)}</strong></td>
                            <td>{String(item.category)}</td>
                            <td>{String(item.sub_category || "—")}</td>
                            <td>{String(item.color || "—")}</td>
                            <td>{String(item.size || "—")}</td>
                            <td>{fiData.warnings?.[String(item.id)] ? <span className="badge badge-warning">Warning</span> : <span className="badge badge-available">Free</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ textAlign: "center", color: "var(--text-muted)" }}>No free dresses for selected dates.</p>
                )}
                {fiData.returning_on_delivery.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--gold-dark)" }}>Dresses Returning on Pickup Date</h4>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead><tr><th>#</th><th>Dress</th><th>Customer</th><th>Contact</th><th>Return Time</th></tr></thead>
                        <tbody>
                          {fiData.returning_on_delivery.map((r, j) => (
                            <tr key={j}>
                              <td>{j + 1}</td>
                              <td>{String(r.display_name || r.dress_name)}</td>
                              <td>{String(r.customer_name)}</td>
                              <td>{String(r.contact || "—")}</td>
                              <td><strong>{String(r.return_time)}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <Link href="/free-items" className="btn btn-outline btn-sm" style={{ marginTop: 12 }}>Open Full Free Items Page</Link>
              </>
            )}
          </div>
        </div>
      )}

      {showBusinessSummary && <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
        <Link href="/inventory" className="btn btn-gold btn-lg">
          <i className="fa-solid fa-layer-group" style={{ marginRight: 10 }} /> Manage Inventory
          <span style={{ marginLeft: 10, background: "rgba(255,255,255,0.25)", padding: "3px 10px", borderRadius: 20, fontSize: 12 }}>{data.stats.total_items} items</span>
        </Link>
        <div style={{ background: "var(--success-bg)", border: "1.5px solid #b2dfdb", borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "var(--success)" }}>
          <strong>{data.stats.available_items}</strong> Available
        </div>
        <div style={{ background: "#EEF2FF", border: "1.5px solid #c7d2fe", borderRadius: 10, padding: "8px 16px", fontSize: 13, color: "#4F46E5" }}>
          <strong>{data.stats.rented_items}</strong> Rented Out
        </div>
      </div>}

      {data.orders_due_soon_list.length > 0 && (
        <div className="card mb-24" style={{ border: "2px solid #b8860b" }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: "#8a6d1a" }}>
              <i className="fa-solid fa-bell" style={{ marginRight: 8 }} />
              Custom Orders Due Soon
            </h3>
            <Link href="/orders" className="btn btn-gold btn-sm">View All Orders</Link>
          </div>
          <div className="card-body p-0">
            {data.orders_due_soon_list.map((o) => {
              const due = bookingDateLabel(o.deliveryDate);
              const overdue = new Date(o.deliveryDate) < new Date(data.today_iso);
              return (
                <div key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", background: overdue ? "rgba(220,53,69,0.05)" : undefined }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700 }}>
                      <Link href={`/booking/${o.booking.id}`} style={{ color: "var(--primary)", textDecoration: "none" }}>
                        #{serialLabel(o.booking.monthlySerial)} — {o.booking.customerName}
                      </Link>
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{o.description}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {o.booking.contact1 ? `📞 ${o.booking.contact1}` : ""}
                      {o.cost === 0
                        ? " · Included in rent"
                        : ` · Cost ₹${formatInr(o.cost)} · Advance ₹${formatInr(o.advance)} · Balance ₹${formatInr(Math.max(0, o.balance))}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 130 }}>
                    <div style={{ fontWeight: 700, color: overdue ? "var(--danger)" : "#8a6d1a" }}>
                      {overdue ? "OVERDUE · " : ""}{due}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{o.deliveryTime}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.overdue_list.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <h3 className="card-title" style={{ color: "var(--danger)" }}>Late Returns</h3>
            <Link href="/late-return" className="btn btn-danger btn-sm">View All</Link>
          </div>
          <div className="card-body p-0">
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Rental #</th><th>Customer</th><th>Due Date</th><th>Amount</th><th></th></tr></thead>
                <tbody>
                  {data.overdue_list.map((r) => (
                    <tr key={r.id}>
                      <td>{r.rentalNumber}</td>
                      <td>{r.customer.name}</td>
                      <td style={{ color: "var(--danger)", fontWeight: 600 }}>{bookingDateLabel(r.endDate ?? "")}</td>
                      <td>₹{formatInr(r.totalAmount)}</td>
                      <td><Link href={`/late-return`} className="btn btn-outline btn-sm">Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
