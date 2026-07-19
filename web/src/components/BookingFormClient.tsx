"use client";

/**
 * BookingFormClient — shared UI for **New Booking**, **Edit Booking**, and **Prospect Lead**.
 *
 * Flow (top → bottom):
 *  1. Customer, contact, venue
 *  2. Delivery / return dates and times
 *  3. **Available Dresses** (collapsible) — inventory free for the chosen dates
 *  4. **Selected Dresses** (collapsible) — chosen lines with rent, advance, notes
 *  5. Date-conflict summary, grand total, staff, save
 *
 * Data sources:
 *  - GET `/api/booking/available-items` — free inventory when dates change
 *  - GET `/api/booking/date-check` — hard conflicts / soft warnings per selected item
 *  - POST `/api/booking` or PUT `/api/booking/[id]` — persist (prospect uses prospect-leads API)
 *
 * Dress panels: both **Available** and **Selected** start expanded; staff may collapse
 * either panel manually via the chevron when the list is long.
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import PhotoCaptureButton from "@/components/PhotoCaptureButton";
import TypeableDateInput from "@/components/TypeableDateInput";
import { generateUuidV4 } from "@/lib/clientUuid";
import { addDaysIso } from "@/lib/dateInput";
import BookingConflictSummary from "@/components/BookingConflictSummary";
import PaymentModePicker from "@/components/PaymentModePicker";
import { inventoryItemMatches } from "@/lib/dress";
import { todayIso, parseDate, isDateBeforeToday } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import { privateMediaUrl, photoUrl } from "@/lib/photoUrl";
import { isAbortError } from "@/lib/bookingQrClient";
import { useToast } from "@/components/ui/Toast";
import { downloadBookingSlipPdf } from "@/lib/bookingSlipClient";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS } from "@/lib/realtime/types";
import { cachedFetchJson, yearMonthKey, invalidateClientCache } from "@/lib/clientRequestCache";



const TIMES = [

  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 Noon", "1:00 PM", "2:00 PM",

  "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM",

];



const MENS_SIZES = [...Array.from({ length: 14 }, (_, i) => String(32 + i * 2)), "Free Size", "Custom"];

/* ── Types for availability API, date-check warnings, and form state ─────── */

type WarningInfo = {
  customer?: string;
  customer_name?: string;
  serial_no: number;
  total_rent?: number;
  venue?: string;
  return_time?: string;
  delivery_time?: string;
  return_date?: string;
  delivery_date?: string;
  contact?: string;
  contact_1?: string;
  booking_number?: string;
};

function warnCustomer(w: WarningInfo) {
  return w.customer || w.customer_name || "—";
}

function warnContact(w: WarningInfo) {
  return w.contact || w.contact_1 || "";
}

/** Human-readable lines for soft warnings shown on dress rows. */
function formatReturningWarning(w: WarningInfo) {
  return (
    <>
      <strong>Returning on the date of delivery</strong> · {warnCustomer(w)} · Serial #{String(w.serial_no).padStart(2, "0")}
      {w.return_time ? ` · by ${w.return_time}` : ""}
      {w.return_date ? ` · Return ${w.return_date}` : ""}
      {w.total_rent ? ` · ₹${formatInr(w.total_rent)}` : ""}
      {w.venue ? ` · ${w.venue}` : ""}
      {warnContact(w) ? ` · ${warnContact(w)}` : ""}
    </>
  );
}

function formatBookedWarning(w: WarningInfo) {
  return (
    <>
      <strong>Booked on the return date</strong> · {warnCustomer(w)} · Serial #{String(w.serial_no).padStart(2, "0")}
      {w.delivery_time ? ` · Pickup ${w.delivery_time}` : ""}
      {w.delivery_date ? ` · Delivery ${w.delivery_date}` : ""}
      {w.total_rent ? ` · ₹${formatInr(w.total_rent)}` : ""}
      {w.venue ? ` · ${w.venue}` : ""}
      {warnContact(w) ? ` · ${warnContact(w)}` : ""}
    </>
  );
}

type DateCheckResult = {
  item_id: number;
  item_name: string;
  status: "ok" | "hard_conflict" | "returning_warning" | "booked_on_return_warning" | "both_warnings";
  conflict?: WarningInfo;
  returning_warning?: WarningInfo | null;
  booked_on_return_warning?: WarningInfo | null;
};

function serialLabel(n: number) {
  return String(n).padStart(2, "0");
}



type FreeItem = {

  id: number;

  name: string;

  display_name?: string;

  sku?: string;

  category: string;

  size?: string;

  color?: string;

  photo?: string;

  returning_warning?: WarningInfo | null;

  booked_warning?: WarningInfo | null;

};



type SelectedDress = {

  id: number | null;

  name: string;

  category: string;

  size: string;

  color?: string;

  photo: string;

  price: number;

  advance: number;

  notes: string;

};



type OrderRow = {

  id?: number;

  description: string;

  cost: number;

  advance: number;

  advance_payment_mode?: "cash" | "online";

  photo: string;

  photoPreview?: string;

  uploading?: boolean;

  delivery_date: string;

  delivery_time: string;

};



type Props = {

  editId?: number;

  initial?: {

    monthly_serial: number;

    customer_name: string;

    customer_address: string;

    contact_1: string;

    whatsapp_no: string;

    venue: string;

    security_deposit: number;

    common_notes: string;

    staff_names: string[];

    delivery_date: string;

    delivery_time: string;

    return_date: string;

    return_time: string;

    items: SelectedDress[];

    orders?: OrderRow[];

  };

  staffList: string[];

  mensCategories: string[];

  womensCategories: string[];

  jewelleryCategories: string[];

  accessoryCategories: string[];

  /** Server-provided calendar today (YYYY-MM-DD) for stable SSR hydration */
  today?: string;

  /** Redirect here after save instead of /booking/[id] */
  afterSaveHref?: string;

  /** When set, show a success banner after redirect from a completed save */
  saveConfirmedSerial?: number;

  /** When "prospect", saves to prospect-leads API without reserving inventory */
  mode?: "booking" | "prospect";

  /** Read-only view for completed/locked bookings */
  readOnly?: boolean;
  locked?: boolean;
  isOwner?: boolean;
  unlockHref?: string;

};



/** Placeholder or thumbnail for a dress photo in list rows. */
function PhotoThumb({ photo, size = 44 }: { photo?: string; size?: number }) {

  const src = photoUrl(photo);

  if (src) {

    return <img src={src} alt="" style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />;

  }

  return (

    <div style={{ width: size, height: size, borderRadius: 8, background: "linear-gradient(135deg, var(--cream-dark), var(--cream))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.45, flexShrink: 0 }}>

      👗

    </div>

  );

}



/** Collapsible card header with chevron — used for Available / Selected dress panels. */
function DressListAccordionHeader({
  expanded,
  onToggle,
  title,
  iconClass,
  iconColor,
  badge,
}: {
  expanded: boolean;
  onToggle: () => void;
  title: string;
  iconClass: string;
  iconColor: string;
  badge: ReactNode;
}) {
  return (
    <div
      className="card-header dress-list-accordion-header"
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={onToggle}
      title={expanded ? "Click to collapse list" : "Click to expand list"}
    >
      <h3 className="card-title">
        <button
          type="button"
          className="dress-list-chevron-btn"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse dress list" : "Expand dress list"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <i className={`fa-solid fa-chevron-${expanded ? "up" : "down"}`} />
        </button>
        <i className={iconClass} style={{ marginRight: 8, color: iconColor }} />
        {title}
      </h3>
      {badge}
    </div>
  );
}



export default function BookingFormClient(props: Props) {

  const router = useRouter();
  const toast = useToast();

  const isProspect = props.mode === "prospect";
  const readOnly = props.readOnly ?? false;
  const today = props.today || todayIso();
  const [minDate, setMinDate] = useState(today);

  const initialDelivery = props.initial?.delivery_date || today;

  const [nowDisplay, setNowDisplay] = useState("");

  const [deliveryDate, setDeliveryDate] = useState(initialDelivery);

  const [returnDate, setReturnDate] = useState(
    props.initial?.return_date || addDaysIso(initialDelivery, 1),
  );

  const [deliveryTime, setDeliveryTime] = useState(props.initial?.delivery_time || "12:00 Noon");

  const [returnTime, setReturnTime] = useState(props.initial?.return_time || "12:00 Noon");

  const [customerName, setCustomerName] = useState(props.initial?.customer_name || "");

  const [customerAddress, setCustomerAddress] = useState(props.initial?.customer_address || "");

  const [contact1, setContact1] = useState(props.initial?.contact_1 || "");

  const [whatsapp, setWhatsapp] = useState(props.initial?.whatsapp_no || "");

  const [venue, setVenue] = useState(props.initial?.venue || "");

  const [securityDeposit, setSecurityDeposit] = useState(props.initial?.security_deposit || 0);

  const [paymentMode, setPaymentMode] = useState<"cash" | "online">("cash");

  const [commonNotes, setCommonNotes] = useState(props.initial?.common_notes || "");

  const [staffNames, setStaffNames] = useState<string[]>(props.initial?.staff_names || []);

  const [serialDisplay, setSerialDisplay] = useState(

    props.initial ? `#${String(props.initial.monthly_serial).padStart(2, "0")}` : "--"

  );

  const [categoryFilter, setCategoryFilter] = useState("");

  const [sizeFilter, setSizeFilter] = useState("");

  const [nameSearch, setNameSearch] = useState("");

  /** Available panel: expanded by default; staff collapse manually if needed. */
  const [dressListExpanded, setDressListExpanded] = useState(true);

  /** Selected panel: always expanded by default so pricing fields stay visible. */
  const [selectedListExpanded, setSelectedListExpanded] = useState(true);

  const [allFreeItems, setAllFreeItems] = useState<FreeItem[]>([]);
  const [availabilityHasMore, setAvailabilityHasMore] = useState(false);
  const [availabilityPageLimit] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? 20 : 30,
  );

  const [selectedDresses, setSelectedDresses] = useState<SelectedDress[]>(props.initial?.items || []);

  const [orders, setOrders] = useState<OrderRow[]>(props.initial?.orders || []);

  /** Orders panel: expanded by default so entered details stay visible. */
  const [ordersListExpanded, setOrdersListExpanded] = useState(true);

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  /** Synchronous lock — React state alone cannot stop double-clicks mid-await. */
  const submittingRef = useRef(false);
  const clientRequestIdRef = useRef<string | null>(null);

  const [error, setError] = useState("");

  const [dateCheckResults, setDateCheckResults] = useState<DateCheckResult[]>([]);

  const [dateCheckLoading, setDateCheckLoading] = useState(false);
  const availabilityAbortRef = useRef<AbortController | null>(null);
  const availabilityCursorRef = useRef<string | null>(null);
  const dateCheckAbortRef = useRef<AbortController | null>(null);
  const availabilityVersionRef = useRef(0);
  const dateCheckVersionRef = useRef(0);
  const lastSerialYmRef = useRef<string>("");
  const lastRealtimeRefreshRef = useRef(0);

  /** True when date-check reports a hard double-booking (blocks save unless prospect). */
  const hasHardBlock = useMemo(
    () => !isProspect && dateCheckResults.some((r) => r.status === "hard_conflict"),
    [dateCheckResults, isProspect]
  );



  useEffect(() => {
    setMinDate(todayIso());
  }, []);

  useEffect(() => {
    function tick() {
      setNowDisplay(new Date().toLocaleString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }));
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);



  const updateSerial = useCallback(async (date: string) => {
    if (props.editId) {
      setSerialDisplay(`#${String(props.initial?.monthly_serial || 0).padStart(2, "0")}`);
      return;
    }
    if (!date) return;
    const ym = yearMonthKey(date);
    if (ym === lastSerialYmRef.current) return;
    try {
      const data = await cachedFetchJson<{ display?: string }>(
        `next-serial:${ym}`,
        async (signal) => {
          const res = await fetch(`/api/booking/next-serial?delivery_date=${date}`, {
            credentials: "same-origin",
            signal,
          });
          if (!res.ok) throw new Error(`serial ${res.status}`);
          return res.json();
        },
        { ttlMs: 30_000 },
      );
      lastSerialYmRef.current = ym;
      setSerialDisplay(data.display ? `#${data.display}` : "--");
    } catch (e) {
      if (isAbortError(e)) return;
      /* keep current serial on transient network errors */
    }
  }, [props.editId, props.initial?.monthly_serial]);



  /** Clears all fields after a new booking is saved so staff can enter the next one. */
  const resetFormForNewBooking = useCallback(() => {
    const t = todayIso();
    setDeliveryDate(t);
    setReturnDate(addDaysIso(t, 1));
    setDeliveryTime("12:00 Noon");
    setReturnTime("12:00 Noon");
    setCustomerName("");
    setCustomerAddress("");
    setContact1("");
    setWhatsapp("");
    setVenue("");
    setSecurityDeposit(0);
    setPaymentMode("cash");
    setCommonNotes("");
    setStaffNames([]);
    setSelectedDresses([]);
    setOrders([]);
    setCategoryFilter("");
    setSizeFilter("");
    setNameSearch("");
    setDateCheckResults([]);
    setDateCheckLoading(false);
    setError("");
    setSerialDisplay("--");
    lastSerialYmRef.current = "";
    void updateSerial(t);
  }, [updateSerial]);



  /** Loads free inventory for delivery/return range; aborts stale requests on date change. */
  const fetchAvailability = useCallback(async (append = false) => {
    if (!deliveryDate || !returnDate) return;
    if (parseDate(returnDate) < parseDate(deliveryDate)) return;

    if (!append) availabilityCursorRef.current = null;
    availabilityAbortRef.current?.abort();
    const controller = new AbortController();
    availabilityAbortRef.current = controller;
    const version = ++availabilityVersionRef.current;

    setLoading(true);
    const cursor = append ? availabilityCursorRef.current : null;
    const params = new URLSearchParams({
      delivery_date: deliveryDate,
      return_date: returnDate,
      category: categoryFilter,
      size: sizeFilter,
      search: nameSearch.trim(),
      limit: String(availabilityPageLimit),
    });
    if (props.editId) params.set("exclude_booking", String(props.editId));
    if (cursor) params.set("cursor", cursor);
    const cacheKey = `avail:${params.toString()}`;

    try {
      const data = await cachedFetchJson<{
        free_items?: FreeItem[];
        error?: string;
        nextCursor?: string | null;
        hasMore?: boolean;
      }>(
        cacheKey,
        async (signal) => {
          const res = await fetch(
            `/api/booking/available-items?${params.toString()}`,
            { credentials: "same-origin", signal, cache: "no-store" },
          );
          const json = await res.json();
          if (!res.ok) {
            const err = new Error(String(json?.error || res.status)) as Error & { status?: number };
            err.status = res.status;
            throw err;
          }
          return json;
        },
        { ttlMs: 20_000, signal: controller.signal },
      );

      if (controller.signal.aborted || version !== availabilityVersionRef.current) return;
      setAllFreeItems((previous) =>
        append ? [...previous, ...(data.free_items || [])] : (data.free_items || []),
      );
      availabilityCursorRef.current =
        typeof data.nextCursor === "string" ? data.nextCursor : null;
      setAvailabilityHasMore(Boolean(data.hasMore));
    } catch (e) {
      if (controller.signal.aborted || isAbortError(e) || version !== availabilityVersionRef.current) {
        return;
      }
      setAllFreeItems([]);
      if ((e as { status?: number })?.status === 401) {
        setError("Session expired — please log in again.");
      }
    } finally {
      if (!controller.signal.aborted && version === availabilityVersionRef.current) {
        setLoading(false);
      }
    }
  }, [
    deliveryDate,
    returnDate,
    props.editId,
    categoryFilter,
    sizeFilter,
    nameSearch,
    availabilityPageLimit,
  ]);

  useRealtimeRefresh([...BOOKING_EVENTS, ...INVENTORY_EVENTS], () => {
    const now = Date.now();
    if (now - lastRealtimeRefreshRef.current < 2_500) return;
    lastRealtimeRefreshRef.current = now;
    invalidateClientCache("avail:");
    invalidateClientCache("datecheck:");
    void fetchAvailability(false);
  });

  useEffect(() => () => {
    availabilityAbortRef.current?.abort();
    dateCheckAbortRef.current?.abort();
  }, []);

  /** Re-checks each selected item for conflicts when dates or selection change. */
  const runDateCheck = useCallback(async () => {
    if (!deliveryDate || !returnDate || !selectedDresses.length) {
      setDateCheckResults([]);
      setDateCheckLoading(false);
      return;
    }
    if (parseDate(returnDate) < parseDate(deliveryDate)) {
      setDateCheckResults([]);
      setDateCheckLoading(false);
      return;
    }

    dateCheckAbortRef.current?.abort();
    const controller = new AbortController();
    dateCheckAbortRef.current = controller;
    const version = ++dateCheckVersionRef.current;
    setDateCheckLoading(true);

    const params = new URLSearchParams({
      booking_id: String(props.editId || 0),
      delivery_date: deliveryDate,
      return_date: returnDate,
    });
    selectedDresses.forEach((d) => params.append("item_ids[]", String(d.id)));
    const itemKey = selectedDresses.map((d) => d.id).filter((id): id is number => id != null).sort((a, b) => a - b).join(",");
    const cacheKey = `datecheck:${props.editId || 0}:${deliveryDate}:${returnDate}:${itemKey}`;

    try {
      const data = await cachedFetchJson<DateCheckResult[] | { results?: DateCheckResult[] }>(
        cacheKey,
        async (signal) => {
          const res = await fetch(`/api/booking/date-check?${params}`, {
            credentials: "same-origin",
            signal,
          });
          const json = await res.json();
          if (!res.ok) {
            const err = new Error(String(json?.error || res.status)) as Error & { status?: number };
            err.status = res.status;
            throw err;
          }
          return json;
        },
        { ttlMs: 15_000, signal: controller.signal },
      );

      if (controller.signal.aborted || version !== dateCheckVersionRef.current) return;
      const results = Array.isArray(data) ? data : (data?.results ?? []);
      setDateCheckResults(results);
    } catch (e) {
      if (controller.signal.aborted || isAbortError(e) || version !== dateCheckVersionRef.current) {
        return;
      }
      // Keep previous results on failure — do not clear correct data from stale/abort races
      if ((e as { status?: number })?.status === 401) {
        setError("Session expired — please log in again.");
      }
    } finally {
      if (!controller.signal.aborted && version === dateCheckVersionRef.current) {
        setDateCheckLoading(false);
      }
    }
  }, [deliveryDate, returnDate, selectedDresses, props.editId]);

  useEffect(() => {
    const t = setTimeout(runDateCheck, 450);
    return () => clearTimeout(t);
  }, [runDateCheck]);

  // next-serial depends only on delivery year-month — not return date
  useEffect(() => {
    const t = setTimeout(() => {
      void updateSerial(deliveryDate);
    }, props.editId ? 0 : 400);
    return () => clearTimeout(t);
  }, [deliveryDate, updateSerial, props.editId]);

  // availability depends on both dates
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchAvailability();
    }, props.editId ? 0 : 450);
    return () => clearTimeout(t);
  }, [deliveryDate, returnDate, categoryFilter, sizeFilter, nameSearch, fetchAvailability, props.editId]);

  const durationDays = useMemo(() => {

    if (!deliveryDate || !returnDate) return 0;

    const d = parseDate(deliveryDate);

    const r = parseDate(returnDate);

    return Math.ceil((r.getTime() - d.getTime()) / 86400000) + 1;

  }, [deliveryDate, returnDate]);



  /* ── Dress list filters (category, size, name) applied client-side ─────── */

  const showSizeFilter = props.mensCategories.includes(categoryFilter);

  const dressNameFilter = nameSearch.trim() && !/^\d+$/.test(nameSearch.trim());


  const filtered = useMemo(() => {

    let list = allFreeItems;

    if (categoryFilter) list = list.filter((i) => i.category === categoryFilter);

    if (dressNameFilter) {
      list = list.filter((i) => inventoryItemMatches(i, nameSearch));
    }

    if (sizeFilter) list = list.filter((i) => i.size?.includes(sizeFilter));

    if (props.mensCategories.includes(categoryFilter)) {

      list = [...list].sort((a, b) => (parseInt(a.size || "999", 10) || 999) - (parseInt(b.size || "999", 10) || 999));

    }

    return list;

  }, [allFreeItems, categoryFilter, dressNameFilter, nameSearch, sizeFilter, props.mensCategories]);



  /** Add/remove a dress from the booking. */
  function toggleDress(item: FreeItem) {

    const idx = selectedDresses.findIndex((d) => d.id === item.id);

    if (idx >= 0) {

      setSelectedDresses(selectedDresses.filter((d) => d.id !== item.id));

    } else {

      setSelectedDresses([...selectedDresses, {

        id: item.id,

        name: item.name,

        category: item.category,

        size: item.size || "",

        color: item.color || "",

        photo: item.photo || "",

        price: 0,

        advance: 0,

        notes: "",

      }]);

    }

  }



  function removeDress(index: number) {

    setSelectedDresses(selectedDresses.filter((_, i) => i !== index));

  }



  function updateDressField(index: number, field: keyof SelectedDress, value: string | number) {

    const next = [...selectedDresses];

    next[index] = { ...next[index], [field]: value };

    setSelectedDresses(next);

  }



  function addOrder() {
    setOrders((prev) => [
      ...prev,
      {
        description: "",
        cost: 0,
        advance: 0,
        advance_payment_mode: paymentMode,
        photo: "",
        delivery_date: deliveryDate || today,
        delivery_time: "12:00 Noon",
      },
    ]);
  }

  function removeOrder(index: number) {
    setOrders((prev) => prev.filter((_, i) => i !== index));
  }

  function updateOrderField(index: number, field: keyof OrderRow, value: string | number) {
    setOrders((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function uploadOrderPhoto(index: number, file: File) {
    const previewUrl = URL.createObjectURL(file);
    setOrders((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], photoPreview: previewUrl, uploading: true };
      return next;
    });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/order-photo", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setOrders((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], photo: data.photo, uploading: false };
        return next;
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Photo upload failed", "error");
      setOrders((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], uploading: false };
        return next;
      });
    }
  }

  const totalPrice = selectedDresses.reduce((s, d) => s + (d.price || 0), 0);

  const totalAdvance = selectedDresses.reduce((s, d) => s + (d.advance || 0), 0);

  const totalRemaining = Math.max(0, totalPrice - totalAdvance);

  const ordersCost = orders.reduce((s, o) => s + (o.cost || 0), 0);

  const ordersAdvance = orders.reduce((s, o) => s + (o.advance || 0), 0);

  const ordersRemaining = orders.reduce((s, o) => s + Math.max(0, (o.cost || 0) - (o.advance || 0)), 0);

  const grandTotalCost = totalPrice + ordersCost;

  const grandTotalAdvance = totalAdvance + ordersAdvance;

  const grandTotalRemaining = totalRemaining + ordersRemaining;



  function applyDeliveryDate(value: string) {
    if (!value) {
      setDeliveryDate("");
      return;
    }
    const next = isDateBeforeToday(value) ? minDate : value.slice(0, 10);
    setDeliveryDate(next);
    const nextReturn = addDaysIso(next, 1);
    if (!props.editId) {
      setReturnDate(nextReturn);
    } else if (!returnDate || returnDate < next) {
      setReturnDate(nextReturn);
    }
  }

  function applyReturnDate(value: string) {
    if (!value) {
      setReturnDate("");
      return;
    }
    let next = isDateBeforeToday(value) ? minDate : value.slice(0, 10);
    const floor = deliveryDate && deliveryDate >= minDate ? deliveryDate : minDate;
    if (next < floor) next = floor;
    setReturnDate(next);
  }



  /** Validates form, POST/PUT booking (or prospect lead), then redirects. */
  async function save(opts?: { openPrintSlip?: boolean; downloadSlipPdf?: boolean }) {
    if (readOnly) return;
    if (submittingRef.current || saving) return;

    setError("");

    if (!selectedDresses.length) {

      setError("Please select at least one dress.");

      return;

    }

    if (!deliveryDate || !returnDate) {
      setError("Please enter delivery and return dates.");
      return;
    }

    if (durationDays < 1) {

      setError("Return date must be on or after delivery date.");

      return;

    }

    if (isDateBeforeToday(deliveryDate) || isDateBeforeToday(returnDate)) {

      setError("Pickup and return dates cannot be before today.");

      return;

    }

    if (hasHardBlock) {

      setError("Cannot save — one or more dresses are already booked during these dates.");

      return;

    }

    // Client date-check is advisory UI only — server transaction is authoritative.
    // Do not block save while a non-authoritative request is still loading.

    submittingRef.current = true;
    setSaving(true);

    if (!props.editId && !isProspect && !clientRequestIdRef.current) {
      clientRequestIdRef.current = generateUuidV4();
    }

    const printWindow =
      opts?.openPrintSlip && !isProspect && !opts?.downloadSlipPdf
        ? window.open("about:blank", "_blank")
        : null;

    try {
    const payload = {

      customer_name: customerName,

      customer_address: customerAddress,

      contact_1: contact1,

      whatsapp_no: whatsapp,

      delivery_date: deliveryDate,

      delivery_time: deliveryTime,

      return_date: returnDate,

      return_time: returnTime,

      venue,

      security_deposit: securityDeposit,

      common_notes: commonNotes,

      staff_names: staffNames,

      ...(!props.editId ? { payment_mode: paymentMode } : {}),
      ...(!props.editId && !isProspect && clientRequestIdRef.current
        ? { client_request_id: clientRequestIdRef.current }
        : {}),

      items: selectedDresses.map((d) => ({

        item_id: d.id,

        dress_name: d.name,

        price: d.price,

        advance: d.advance,

        notes: d.notes,

      })),

      orders: orders
        .filter((o) => o.description.trim())
        .map((o) => ({
          ...(o.id ? { id: o.id } : {}),
          description: o.description,
          cost: o.cost || 0,
          advance: o.advance || 0,
          advance_payment_mode: props.editId ? (o.advance_payment_mode || "cash") : paymentMode,
          photo: o.photo || undefined,
          delivery_date: o.delivery_date,
          delivery_time: o.delivery_time,
        })),

    };



    const url = isProspect
      ? "/api/prospect-leads"
      : props.editId
        ? `/api/booking/${props.editId}`
        : "/api/booking";

    const method = isProspect || !props.editId ? "POST" : "PUT";

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });

    let data: { error?: string; id?: number; serial?: number; monthly_serial?: number } = {};
    try {
      data = await res.json();
    } catch {
      printWindow?.close();
      setError("Network error — could not read server response. Check connection and try again.");
      return;
    }

    if (!res.ok) {
      printWindow?.close();
      setError(data.error || "Save failed");

      return;
    }

    const bookingId = data.id;
    if (!bookingId) {
      printWindow?.close();
      setError("Booking saved but could not open the record. Check the Booking Panel.");
      return;
    }

    clientRequestIdRef.current = null;

    if (printWindow) {
      printWindow.location.href = `/booking/${bookingId}/slip?print=1`;
    }

    if (opts?.downloadSlipPdf && !isProspect) {
      try {
        await downloadBookingSlipPdf(bookingId);
        toast("✅ Booking saved — PDF downloaded", "success");
      } catch (e) {
        toast(
          e instanceof Error ? e.message : "Booking saved but PDF download failed",
          "error",
        );
        router.push(`/booking/${bookingId}/slip?offerPdf=1`);
        return;
      }
    } else if (!isProspect) {
      toast(
        opts?.openPrintSlip
          ? printWindow
            ? "✅ Booking Saved — opening A4 slip for print"
            : "✅ Booking Saved — opening slip (use Download PDF if print is unavailable)"
          : "✅ Booking Saved!",
        "success",
      );
    }

    if (opts?.openPrintSlip && !isProspect && !printWindow && !props.editId) {
      router.push(`/booking/${bookingId}/slip?print=1&offerPdf=1`);
      return;
    }

    if (isProspect) {
      const serial = data.serial ?? data.monthly_serial;
      toast("Prospect lead saved", "success");
      resetFormForNewBooking();
      router.replace(`/prospect-leads/new?saved=1&serial=${serial ?? ""}`);
      window.scrollTo(0, 0);
    } else if (!props.editId) {
      const serial = data.serial ?? data.monthly_serial;
      resetFormForNewBooking();
      invalidateClientCache();
      router.replace(`/booking/new?confirmed=1&serial=${serial ?? ""}`);
      window.scrollTo(0, 0);
    }
    else {
      invalidateClientCache();
      router.replace(props.afterSaveHref || `/booking/${bookingId}`);
    }

    } catch (e) {
      printWindow?.close();
      setError(
        e instanceof Error
          ? `Network error: ${e.message}`
          : "Network error — please check your connection and try again.",
      );
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }



  function rowStyle(item: FreeItem, selected: boolean): CSSProperties {

    let bg: string | undefined;

    if (selected) bg = "rgba(123,31,69,0.06)";

    else if (item.returning_warning && item.booked_warning) bg = "#FFF3E0";

    else if (item.returning_warning) bg = "#FFF8E1";

    else if (item.booked_warning) bg = "#FFF0F0";

    return {

      display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",

      borderBottom: "1px solid var(--border)", cursor: "pointer", background: bg,

    };

  }



  return (

    <div>

      <div style={{ marginBottom: 16 }}>

        <LinkBreadcrumb editId={props.editId} serial={props.initial?.monthly_serial} mode={props.mode} />

      </div>



      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {props.saveConfirmedSerial != null && props.saveConfirmedSerial > 0 && (
        <div className="alert alert-success" style={{ marginBottom: 16, fontSize: 15 }}>
          <i className="fa-solid fa-circle-check" style={{ marginRight: 8 }} />
          <strong>{isProspect ? "Prospect lead saved" : "Booking confirmed"}</strong>
          {" — Serial "}
          <strong>#{String(props.saveConfirmedSerial).padStart(2, "0")}</strong>
          {isProspect
            ? " saved successfully. Enter the next prospect lead below."
            : " saved successfully. Enter the next booking below."}
        </div>
      )}

      {props.locked && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid #1565c0", background: "rgba(21,101,192,0.06)" }}>
          <div className="card-body" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, color: "#1565c0" }}>
                <i className="fa-solid fa-lock" style={{ marginRight: 8 }} />
                Completed Booking — Read Only
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {readOnly
                  ? "This record is locked. Only the owner can unlock and edit it."
                  : "Owner unlock active — you may edit this completed booking."}
              </div>
            </div>
            {readOnly && props.isOwner && props.unlockHref && (
              <a href={props.unlockHref} className="btn btn-primary">
                <i className="fa-solid fa-unlock" style={{ marginRight: 8 }} />
                Unlock &amp; Edit
              </a>
            )}
          </div>
        </div>
      )}

      <fieldset disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>

      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, var(--primary-dark), var(--primary))", color: "white" }}>

        <div className="card-body booking-header-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>

          <div>

            {!props.editId && !isProspect && (
              <div suppressHydrationWarning style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, opacity: 0.95, lineHeight: 1.35 }}>
                <i className="fa-solid fa-calendar-day" style={{ marginRight: 6 }} />
                Booking Date: {nowDisplay || "—"}
              </div>
            )}

            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {isProspect ? "New Prospect Lead" : props.editId ? "Edit Booking" : "New Booking"}
            </div>

            <div style={{ fontSize: 12, opacity: 0.8 }}>Monthly serial is based on delivery month</div>

          </div>

          <div style={{ textAlign: "right" }}>

            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "Playfair Display, serif" }}>{serialDisplay}</div>

            <div style={{ fontSize: 11, opacity: 0.8 }}>Serial #</div>

          </div>

        </div>

      </div>



      <div className="two-col" style={{ marginBottom: 20 }}>

        <div className="card">

          <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-user-circle" style={{ marginRight: 8 }} />Customer Details</h3></div>

          <div className="card-body form-grid">

            <div className="form-group full-width">

              <label className="form-label">Customer Name *</label>

              <input className="form-control" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />

            </div>

            {(!props.editId && !isProspect) ? null : (
            <div className="form-group full-width" suppressHydrationWarning>

              <label className="form-label">Booking Date &amp; Time</label>

              <input
                className="form-control"
                value={nowDisplay || "—"}
                readOnly
                style={{ background: "var(--cream-dark)", cursor: "default" }}
                title="When this booking is saved (today's date and time)"
              />

              <span className="form-hint">Date the booking is entered — not delivery or return</span>

            </div>
            )}

            <div className="form-group full-width">

              <label className="form-label">Address *</label>

              <textarea className="form-control" rows={2} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} required />

            </div>

            <div className="form-group">

              <label className="form-label">Contact *</label>

              <input className="form-control" value={contact1} onChange={(e) => setContact1(e.target.value)} required />

            </div>

            <div className="form-group">

              <label className="form-label">WhatsApp *</label>

              <input className="form-control" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />

            </div>

            <div className="form-group full-width">

              <label className="form-label">Venue</label>

              <input className="form-control" value={venue} onChange={(e) => setVenue(e.target.value)} />

            </div>

            {(props.editId || isProspect) && (
            <div className="form-group full-width">

              <label className="form-label">Security Deposit (₹)</label>

              <input type="number" className="form-control" value={securityDeposit} onChange={(e) => setSecurityDeposit(Number(e.target.value))} min={0} />

            </div>
            )}

            <div className="form-group full-width">

              <label className="form-label">Staff</label>

              <select multiple className="form-control" style={{ minHeight: 60 }} value={staffNames}

                onChange={(e) => setStaffNames(Array.from(e.target.selectedOptions, (o) => o.value))}>

                {props.staffList.map((s) => <option key={s} value={s}>{s}</option>)}

              </select>

              <span className="form-hint">Hold Ctrl to select multiple staff members</span>

            </div>

          </div>

        </div>



        <div className="card">

          <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-truck-fast" style={{ marginRight: 8 }} />Delivery & Return</h3></div>

          <div className="card-body form-grid form-grid-2">

            <div className="form-group">

              <label className="form-label">Delivery Date *</label>

              <TypeableDateInput
                min={minDate}
                value={deliveryDate}
                onChange={applyDeliveryDate}
              />

              <span className="form-hint">Type DD-MM-YYYY or use the calendar · cannot be before today</span>

            </div>

            <div className="form-group">

              <label className="form-label">Delivery Time *</label>

              <select className="form-control" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)}>

                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}

              </select>

            </div>

            <div className="form-group">

              <label className="form-label">Return Date *</label>

              <TypeableDateInput
                min={deliveryDate && deliveryDate >= minDate ? deliveryDate : minDate}
                value={returnDate}
                onChange={applyReturnDate}
              />

              <span className="form-hint">Type DD-MM-YYYY or use the calendar · cannot be before today or delivery date</span>

            </div>

            <div className="form-group">

              <label className="form-label">Return Time *</label>

              <select className="form-control" value={returnTime} onChange={(e) => setReturnTime(e.target.value)}>

                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}

              </select>

            </div>

          </div>

          {deliveryDate && returnDate && (

            <div style={{ margin: "0 20px 16px", padding: "10px 14px", background: "var(--cream-dark)", borderRadius: 8, fontSize: 13, color: durationDays >= 1 ? "var(--primary)" : "var(--danger)", fontWeight: 600 }}>

              {durationDays >= 1 ? (

                <>Duration: <strong>{durationDays} day{durationDays > 1 ? "s" : ""}</strong></>

              ) : (

                <>Return date must be on or after delivery date!</>

              )}

            </div>

          )}

        </div>

      </div>



      {/* ── Available dresses: filterable inventory for selected dates (collapsible) ── */}
      <div className="card" style={{ marginBottom: 20 }}>

        <DressListAccordionHeader
          expanded={dressListExpanded}
          onToggle={() => setDressListExpanded((v) => !v)}
          title="Available Dresses"
          iconClass="fa-solid fa-shirt"
          iconColor="var(--success)"
          badge={<span className="badge badge-available">{loading ? "…" : `${filtered.length} available`}</span>}
        />

        {dressListExpanded && (
        <div className="card-body">

          <div className="form-row-flex" style={{ marginBottom: 14, overflow: "visible", position: "relative", zIndex: 10 }}>

            <select className="form-control" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setSizeFilter(""); }}>

              <option value="">All Categories</option>

              <optgroup label="Men's">{props.mensCategories.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>

              <optgroup label="Women's">{props.womensCategories.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>

              <optgroup label="Jewellery">{props.jewelleryCategories.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>

              <optgroup label="Accessories">{props.accessoryCategories.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>

            </select>

            {showSizeFilter && (

              <select className="form-control" value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)}>

                <option value="">All Sizes</option>

                {MENS_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}

              </select>

            )}

            <DressNameSuggestInput
              className="form-control"
              placeholder="Filter by dress name or SKU…"
              value={nameSearch}
              category={categoryFilter}
              showPhotos
              suggestions={Boolean(dressNameFilter)}
              minChars={2}
              onChange={(e) => setNameSearch(e.target.value)}
              onSuggestSelect={(item) => setNameSearch(item.name)}
            />

          </div>

          {/^\d+$/.test(nameSearch.trim()) && (
            <p className="form-hint" style={{ marginTop: -6, marginBottom: 12 }}>
              This box filters available dresses by name or SKU. For serial # lookup, use Search Booking or All Record Search.
            </p>
          )}

          {loading && filtered.length === 0 ? (

            <p style={{ textAlign: "center", padding: 30, color: "var(--text-muted)" }}><i className="fa-solid fa-spinner fa-spin" /> Checking availability…</p>

          ) : !deliveryDate || !returnDate ? (

            <p style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Select delivery & return dates to see available dresses.</p>

          ) : filtered.length === 0 ? (

            <p style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No dresses available for these dates.</p>

          ) : (

            <>
            <div className="dress-picker-scroll">

              {filtered.map((item) => {

                const sel = selectedDresses.some((d) => d.id === item.id);

                return (

                  <div key={item.id} onClick={() => toggleDress(item)} style={rowStyle(item, sel)}>

                    <PhotoThumb photo={item.photo} />

                    <div style={{ flex: 1, minWidth: 0 }}>

                      <div style={{ fontWeight: 600 }}>{item.display_name || item.name}</div>

                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>

                        {item.category}{item.size ? ` · ${item.size}` : ""}{item.color ? ` · ${item.color}` : ""}

                      </div>

                      {item.returning_warning && (
                        <div style={{ fontSize: 10, color: "#E65100", marginTop: 2, lineHeight: 1.3 }}>
                          <i className="fa-solid fa-triangle-exclamation" /> {formatReturningWarning(item.returning_warning)}
                        </div>
                      )}

                      {item.booked_warning && (
                        <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 2, lineHeight: 1.3 }}>
                          <i className="fa-solid fa-circle-exclamation" /> {formatBookedWarning(item.booked_warning)}
                        </div>
                      )}

                    </div>

                    <div style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${sel ? "var(--primary)" : "var(--border)"}`, background: sel ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0 }}>

                      {sel ? "✓" : ""}

                    </div>

                  </div>

                );

              })}

            </div>
            {availabilityHasMore && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={loading}
                  onClick={() => void fetchAvailability(true)}
                >
                  {loading ? "Loading…" : "Load More Available Items"}
                </button>
              </div>
            )}
            </>

          )}

        </div>
        )}

      </div>



      {/* ── Selected dresses: rent / advance / notes per line (collapsible) ── */}
      <div className="card" style={{ marginBottom: 20 }}>

        <DressListAccordionHeader
          expanded={selectedListExpanded}
          onToggle={() => setSelectedListExpanded((v) => !v)}
          title="Selected Dresses"
          iconClass="fa-solid fa-check-double"
          iconColor="var(--success)"
          badge={<span className="badge badge-available">{selectedDresses.length} selected</span>}
        />

        {selectedListExpanded && (
        <div className="card-body">

          {!selectedDresses.length ? (

            <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
              Click dresses above to add them to this booking.
            </p>

          ) : (

            <div className="dress-picker-scroll">

            {selectedDresses.map((d, i) => {
              const warn = allFreeItems.find((f) => f.id === d.id);
              return (
              <div key={d.id} style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 14, background: "linear-gradient(135deg, rgba(123,31,69,0.02), rgba(201,168,70,0.02))" }}>

                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>

                  <PhotoThumb photo={d.photo} size={56} />

                  <div style={{ flex: 1 }}>

                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>{d.name}</div>

                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{d.category}{d.size ? ` · ${d.size}` : ""}{d.color ? ` · ${d.color}` : ""}</div>

                    {warn?.returning_warning && (
                      <div style={{ fontSize: 10, color: "#E65100", marginTop: 4, lineHeight: 1.3 }}>
                        <i className="fa-solid fa-triangle-exclamation" /> {formatReturningWarning(warn.returning_warning)}
                      </div>
                    )}

                    {warn?.booked_warning && (
                      <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 4, lineHeight: 1.3 }}>
                        <i className="fa-solid fa-circle-exclamation" /> {formatBookedWarning(warn.booked_warning)}
                      </div>
                    )}

                  </div>

                  <button type="button" onClick={() => removeDress(i)} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "var(--danger-bg)", color: "var(--danger)", cursor: "pointer" }}>✕</button>

                </div>

                <div className="payment-grid-3" style={{ marginBottom: 12 }}>

                  <div>

                    <label className="form-label">Rental Price (₹)</label>

                    <input type="number" className="form-control" value={d.price} min={0} onChange={(e) => updateDressField(i, "price", Number(e.target.value))} />

                  </div>

                  <div>

                    <label className="form-label">Advance Paid (₹)</label>

                    <input type="number" className="form-control" value={d.advance} min={0} onChange={(e) => updateDressField(i, "advance", Number(e.target.value))} />

                  </div>

                  <div>

                    <label className="form-label">Remaining</label>

                    <div style={{ padding: "8px 12px", background: "var(--danger-bg)", borderRadius: 8, textAlign: "center", fontSize: 16, fontWeight: 800, color: "var(--danger)" }}>

                      ₹{formatInr(Math.max(0, d.price - d.advance))}

                    </div>

                  </div>

                </div>

                <div>

                  <label className="form-label">Notes for {d.name}</label>

                  <textarea className="form-control" rows={1} value={d.notes} onChange={(e) => updateDressField(i, "notes", e.target.value)} placeholder="Special notes for this dress…" />

                </div>

              </div>
            );
            })}

            </div>

          )}

        </div>
        )}

      </div>



      {/* ── Custom Orders: newly-made items with their own delivery date/time ── */}
      <div className="card" style={{ marginBottom: 20 }}>

        <DressListAccordionHeader
          expanded={ordersListExpanded}
          onToggle={() => setOrdersListExpanded((v) => !v)}
          title="Orders (Custom-Made)"
          iconClass="fa-solid fa-scissors"
          iconColor="var(--gold, #c9a846)"
          badge={<span className="badge badge-available">{orders.length} order{orders.length === 1 ? "" : "s"}</span>}
        />

        {ordersListExpanded && (
        <div className="card-body">

          <p className="form-hint" style={{ marginTop: 0, marginBottom: 14 }}>
            Add items to be freshly prepared on the customer&apos;s request. Set cost <strong>0</strong> if the item
            is included in the rent.
          </p>

          {!orders.length ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 16 }}>
              No custom orders added yet.
            </p>
          ) : (
            <div className="dress-picker-scroll">
            {orders.map((o, i) => (
              <div key={i} style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 14, background: "linear-gradient(135deg, rgba(201,168,70,0.04), rgba(123,31,69,0.02))" }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--primary)" }}>
                    <i className="fa-solid fa-scissors" style={{ marginRight: 8 }} />
                    Order #{i + 1}
                  </div>
                  <button type="button" onClick={() => removeOrder(i)} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "var(--danger-bg)", color: "var(--danger)", cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>

                  <div>
                    <label className="form-label">Description / Note *</label>
                    <textarea className="form-control" rows={2} value={o.description} onChange={(e) => updateOrderField(i, "description", e.target.value)} placeholder="Describe the custom order (fabric, measurements, design…)" />
                  </div>

                  <div className="payment-grid-3">
                    <div>
                      <label className="form-label">Total Cost (₹)</label>
                      <input type="number" className="form-control" value={o.cost} min={0} onChange={(e) => updateOrderField(i, "cost", Number(e.target.value))} />
                      {o.cost === 0 && (
                        <span className="form-hint" style={{ color: "var(--gold, #c9a846)" }}>Included in rent</span>
                      )}
                    </div>
                    <div>
                      <label className="form-label">Advance (₹)</label>
                      <input type="number" className="form-control" value={o.advance} min={0} onChange={(e) => updateOrderField(i, "advance", Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Balance</label>
                      <div style={{ padding: "8px 12px", background: "var(--danger-bg)", borderRadius: 8, textAlign: "center", fontSize: 16, fontWeight: 800, color: "var(--danger)" }}>
                        ₹{formatInr(Math.max(0, (o.cost || 0) - (o.advance || 0)))}
                      </div>
                    </div>
                  </div>

                  {(o.advance || 0) > 0 && (
                    <div style={{ marginBottom: 12, fontSize: 12, color: "var(--text-muted)", padding: "8px 12px", background: "var(--cream-dark)", borderRadius: 8 }}>
                      <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />
                      Advance payment mode follows the booking: <strong>{paymentMode === "online" ? "Online" : "Cash"}</strong>
                    </div>
                  )}

                  <div className="form-grid form-grid-2" style={{ gap: 12 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Delivery Date *</label>
                      <TypeableDateInput
                        min={minDate}
                        value={o.delivery_date}
                        onChange={(v) => updateOrderField(i, "delivery_date", (v || "").slice(0, 10))}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Delivery Time *</label>
                      <select className="form-control" value={o.delivery_time} onChange={(e) => updateOrderField(i, "delivery_time", e.target.value)}>
                        {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Sample Photo</label>
                    <PhotoCaptureButton
                      label={`Order #${i + 1} sample`}
                      modalTitle="Capture sample photo"
                      previewUrl={o.photoPreview}
                      savedUrl={privateMediaUrl(o.photo)}
                      onCapture={(file) => uploadOrderPhoto(i, file)}
                      emptyHeight={100}
                    />
                    {o.uploading && (
                      <span className="form-hint"><i className="fa-solid fa-spinner fa-spin" /> Uploading photo…</span>
                    )}
                  </div>

                </div>

              </div>
            ))}
            </div>
          )}

          {!readOnly && (
            <button type="button" className="btn btn-outline" style={{ marginTop: 4 }} onClick={addOrder}>
              <i className="fa-solid fa-plus" style={{ marginRight: 8 }} />
              Add Order
            </button>
          )}

          {orders.length > 0 && (
            <div className="payment-grid-3" style={{ marginTop: 16 }}>
              <div style={{ textAlign: "center", padding: 12, background: "var(--cream-dark)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Orders Cost</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--primary)" }}>₹{formatInr(ordersCost)}</div>
              </div>
              <div style={{ textAlign: "center", padding: 12, background: "var(--success-bg)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Orders Advance</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--success)" }}>₹{formatInr(ordersAdvance)}</div>
              </div>
              <div style={{ textAlign: "center", padding: 12, background: "var(--danger-bg)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Orders Balance</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--danger)" }}>₹{formatInr(ordersRemaining)}</div>
              </div>
            </div>
          )}

        </div>
        )}

      </div>



      {(dateCheckLoading || dateCheckResults.length > 0) && selectedDresses.length > 0 && (

        <BookingConflictSummary loading={dateCheckLoading} results={dateCheckResults} />

      )}



      <div className="card" style={{ marginBottom: 20 }}>

        <div className="card-header"><h3 className="card-title"><i className="fa-solid fa-calculator" style={{ marginRight: 8 }} />Grand Total</h3></div>

        <div className="card-body">

          <div className="payment-grid-3">

            <div style={{ textAlign: "center", padding: 14, background: "var(--cream-dark)", borderRadius: 10 }}>

              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Total {ordersCost > 0 ? "(Rent + Orders)" : "Rent"}</div>

              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>₹{formatInr(grandTotalCost)}</div>

              {ordersCost > 0 && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Rent ₹{formatInr(totalPrice)} · Orders ₹{formatInr(ordersCost)}</div>
              )}

            </div>

            <div style={{ textAlign: "center", padding: 14, background: "var(--success-bg)", borderRadius: 10 }}>

              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Advance</div>

              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--success)" }}>₹{formatInr(grandTotalAdvance)}</div>

            </div>

            <div style={{ textAlign: "center", padding: 14, background: "var(--danger-bg)", borderRadius: 10 }}>

              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Total Remaining</div>

              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--danger)" }}>₹{formatInr(grandTotalRemaining)}</div>

            </div>

          </div>

          <div className="form-group" style={{ marginTop: 18 }}>

            <label className="form-label">Common Notes (for all dresses)</label>

            <textarea className="form-control" rows={2} value={commonNotes} onChange={(e) => setCommonNotes(e.target.value)} placeholder="Any common instructions for this booking…" />

          </div>

        </div>

      </div>

      {!props.editId && !isProspect && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Security Deposit (₹)</label>
              <input
                type="number"
                className="form-control"
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                min={0}
              />
            </div>
          </div>
        </div>
      )}

      </fieldset>

      {!readOnly && (
      <div className="card">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!props.editId && (
            <PaymentModePicker
              value={paymentMode}
              onChange={setPaymentMode}
              label="Advance Payment Mode *"
              name="bookingPaymentMode"
            />
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary btn-lg" disabled={saving || !selectedDresses.length || hasHardBlock} onClick={() => void save()}>
            {hasHardBlock ? "Cannot Save — Dress Already Booked" : saving ? "Saving…" : isProspect ? "Save Prospect Lead" : props.editId ? "Update Booking" : "Save Booking"}
          </button>
          {!props.editId && !isProspect && (
            <>
            <button
              type="button"
              className="btn btn-outline btn-lg"
              disabled={saving || !selectedDresses.length || hasHardBlock}
              onClick={() => void save({ openPrintSlip: true })}
              style={{ color: "#1a5c2a", borderColor: "#1a5c2a", display: "inline-flex", alignItems: "center", gap: 8 }}
              title="Save booking and open A4 slip for printing"
            >
              <i className="fa-solid fa-print" />
              {saving ? "Saving…" : "Save & Print Slip"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-lg"
              disabled={saving || !selectedDresses.length || hasHardBlock}
              onClick={() => void save({ downloadSlipPdf: true })}
              style={{ color: "#b45309", borderColor: "#b45309", display: "inline-flex", alignItems: "center", gap: 8 }}
              title="Save booking and download A4 slip PDF (for mobile or when no printer is connected)"
            >
              <i className="fa-solid fa-file-pdf" />
              {saving ? "Saving…" : "Save & Download PDF"}
            </button>
            </>
          )}
          <a href={isProspect ? "/prospect-leads" : props.editId ? `/booking/${props.editId}` : "/booking"} className="btn btn-outline">Cancel</a>
          </div>
        </div>
      </div>
      )}

      {readOnly && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <a href={props.editId ? `/booking/${props.editId}` : "/booking"} className="btn btn-outline">
              <i className="fa-solid fa-arrow-left" style={{ marginRight: 8 }} />
              Back to Booking Record
            </a>
          </div>
        </div>
      )}

    </div>

  );

}



/** Top-of-page breadcrumb: Dashboard → Booking list → New / Edit / Prospect. */
function LinkBreadcrumb({ editId, serial, mode }: { editId?: number; serial?: number; mode?: "booking" | "prospect" }) {

  if (mode === "prospect") {
    return (
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        <a href="/prospect-leads" style={{ color: "var(--primary)", textDecoration: "none" }}>Prospect & Enquiries</a>
        {" › Add Prospect"}
      </div>
    );
  }

  return (

    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>

      <Link href="/booking" style={{ color: "var(--primary)", textDecoration: "none" }}>Bookings</Link>

      {" › "}

      {editId ? `Edit Serial #${String(serial || 0).padStart(2, "0")}` : "New Booking"}

    </div>

  );

}


