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
import BookingPhotoThumb from "@/components/BookingPhotoThumb";
import BookingTimeSelect from "@/components/BookingTimeSelect";
import PhotoCaptureButton from "@/components/PhotoCaptureButton";
import TypeableDateInput from "@/components/TypeableDateInput";
import { generateUuidV4 } from "@/lib/clientUuid";
import { addDaysIso } from "@/lib/dateInput";
import BookingConflictSummary from "@/components/BookingConflictSummary";
import PaymentModePicker from "@/components/PaymentModePicker";
import { inventoryItemMatches, stripUnitSuffix } from "@/lib/dress";
import {
  collapseMensAvailabilityItems,
  mergeAvailabilityItemsById,
} from "@/lib/mensAvailabilityCollapse";
import { todayIso, parseDate, isDateBeforeToday } from "@/lib/constants";
import { formatInr } from "@/lib/format";
import { privateMediaUrl } from "@/lib/photoUrl";
import { isAbortError } from "@/lib/bookingQrClient";
import { refocusInput } from "@/lib/hardwareScanner";
import { useToast } from "@/components/ui/Toast";
import { downloadBookingSlipPdf } from "@/lib/bookingSlipClient";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { useBlockWheelValueChange } from "@/hooks/useBlockWheelValueChange";
import { preventInputWheel } from "@/lib/preventInputWheel";
import { BOOKING_EVENTS, INVENTORY_EVENTS } from "@/lib/realtime/types";
import { cachedFetchJson, yearMonthKey, invalidateClientCache } from "@/lib/clientRequestCache";
import BookingSelectedDressRow from "@/components/booking/BookingSelectedDressRow";
import {
  bookingItemRemaining,
  sumBookingFittingCharges,
} from "@/lib/bookingLineTotals";

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

type PreviousCustomer = {
  customer_name: string;
  customer_address: string;
  contact_1: string;
  whatsapp_no: string;
  venue: string;
};



type FreeItem = {

  id: number;

  name: string;

  display_name?: string;

  sku?: string;

  category: string;

  size?: string;

  color?: string;

  photo?: string;

  free_quantity?: number;

  total_quantity?: number;

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

  fittingCharges: number;

  advance: number;

  notes: string;

  returning_warning?: WarningInfo | null;

  booked_warning?: WarningInfo | null;

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
  const [showPreviousCustomers, setShowPreviousCustomers] = useState(false);
  const [prefetchedCustomers, setPrefetchedCustomers] = useState<PreviousCustomer[] | null>(null);

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
  const [scanBusy, setScanBusy] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const scanBuffer = useRef("");
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dressSearchInputRef = useRef<HTMLInputElement>(null);
  const scanKeepFocusRef = useRef(false);

  /** Available panel: expanded by default; staff collapse manually if needed. */
  const [dressListExpanded, setDressListExpanded] = useState(true);

  const refocusDressSearch = useCallback(() => {
    refocusInput(dressSearchInputRef.current, 50);
  }, []);

  useEffect(() => {
    scanKeepFocusRef.current = dressListExpanded && !showCameraScanner;
    if (scanKeepFocusRef.current) {
      refocusDressSearch();
    }
  }, [dressListExpanded, showCameraScanner, refocusDressSearch]);

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
  const formRootRef = useRef<HTMLFieldSetElement>(null);
  useBlockWheelValueChange(formRootRef);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/booking/customer-lookup")
      .then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((data: { customers?: PreviousCustomer[] }) => {
        if (!cancelled) setPrefetchedCustomers(data.customers || []);
      })
      .catch(() => {
        if (!cancelled) setPrefetchedCustomers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const searching = nameSearch.trim().length >= 2;
    const pageLimit = searching ? Math.max(availabilityPageLimit, 50) : availabilityPageLimit;
    const maxPages = searching ? 8 : 1;
    let nextAppend = append;

    try {
      for (let page = 0; page < maxPages; page += 1) {
        const cursor = nextAppend ? availabilityCursorRef.current : null;
        const params = new URLSearchParams({
          delivery_date: deliveryDate,
          return_date: returnDate,
          category: categoryFilter,
          size: sizeFilter,
          search: nameSearch.trim(),
          limit: String(pageLimit),
        });
        if (props.editId) params.set("exclude_booking", String(props.editId));
        if (cursor) params.set("cursor", cursor);
        const cacheKey = `avail:${params.toString()}`;

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
          nextAppend
            ? mergeAvailabilityItemsById(previous, data.free_items || [])
            : (data.free_items || []),
        );
        availabilityCursorRef.current =
          typeof data.nextCursor === "string" ? data.nextCursor : null;
        const more = Boolean(data.hasMore);
        setAvailabilityHasMore(more);
        if (!searching || !more) break;
        nextAppend = true;
      }
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
    // Men's: one row per size so searching a sherwani shows 36/38/40… not the same size 20 times.
    list = collapseMensAvailabilityItems(list);
    if (
      props.mensCategories.includes(categoryFilter) ||
      list.some((i) => props.mensCategories.includes(i.category))
    ) {
      list = [...list].sort((a, b) => {
        const nameCmp = stripUnitSuffix(a.name).localeCompare(stripUnitSuffix(b.name));
        if (nameCmp !== 0) return nameCmp;
        return (parseInt(a.size || "999", 10) || 999) - (parseInt(b.size || "999", 10) || 999);
      });
    }
    return list;
  }, [allFreeItems, categoryFilter, dressNameFilter, nameSearch, sizeFilter, props.mensCategories]);



  function addSelectedDressFromItem(item: FreeItem) {
    setSelectedDresses((prev) => [...prev, {
      id: item.id,
      name: item.name,
      category: item.category,
      size: item.size || "",
      color: item.color || "",
      photo: item.photo || "",
      price: 0,
      fittingCharges: 0,
      advance: 0,
      notes: "",
      returning_warning: item.returning_warning || null,
      booked_warning: item.booked_warning || null,
    }]);
    setNameSearch("");
  }

  /** Add/remove a dress from the booking. */
  function toggleDress(item: FreeItem) {

    const idx = selectedDresses.findIndex((d) => d.id === item.id);

    if (idx >= 0) {

      setSelectedDresses(selectedDresses.filter((d) => d.id !== item.id));

    } else {

      if (!confirmAlternateDressAdd(item.returning_warning, item.booked_warning)) return;
      addSelectedDressFromItem(item);

    }

  }



  const handleScanCode = useCallback(async (code: string) => {
    if (scanBusy) return;
    const trimmed = code.trim();
    if (!trimmed) return;
    if (!deliveryDate || !returnDate) {
      alert("Please select delivery and return dates before scanning a dress.");
      return;
    }
    if (parseDate(returnDate) < parseDate(deliveryDate)) {
      alert("Return date must be on or after delivery date before scanning.");
      return;
    }
    setScanBusy(true);
    try {
      const res = await fetch("/api/booking/scan-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: trimmed,
          delivery_date: deliveryDate,
          return_date: returnDate,
          delivery_time: deliveryTime,
          return_time: returnTime,
          exclude_booking: props.editId || undefined,
        }),
      });
      const data = await res.json() as {
        status: string;
        error?: string;
        item?: { id: number; name: string; category: string; size: string; color: string; photo: string } | null;
        free_quantity?: number;
        blockingRecords?: ScanConflictRecord[];
        warningRecords?: ScanConflictRecord[];
      };
      if (!res.ok) {
        alert(data.error || "Failed to check scanned dress availability.");
        return;
      }
      if (data.status === "CODE_NOT_FOUND") {
        alert("Dress not found for this QR/barcode.");
        return;
      }
      if (data.status === "AMBIGUOUS_LEGACY_CODE") {
        alert("Multiple dresses match this code. Please select the dress manually.");
        return;
      }
      if (!data.item || data.status === "MAINTENANCE") {
        alert(data.status === "MAINTENANCE" ? "This dress is currently under maintenance." : "This dress is not available.");
        return;
      }
      if (data.status === "INACTIVE") {
        alert("This dress is inactive and cannot be booked.");
        return;
      }
      if (selectedDresses.some((d) => d.id === data.item!.id)) {
        toast?.("This dress is already added to the booking.", "info");
        return;
      }
      if (data.status.startsWith("WARNING_")) {
        const scanWarnings = warningsFromScanRecords(data.warningRecords || []);
        if (!confirmAlternateDressAdd(scanWarnings.returning_warning, scanWarnings.booked_warning)) return;
      } else if (data.status === "BOOKED" || (data.free_quantity != null && data.free_quantity <= 0)) {
        const who = (data.blockingRecords || [])
          .map((r) => `${r.customerName} (${r.bookingNumber})`)
          .join(", ");
        alert(
          who
            ? `${data.item.name} is already booked for these dates.\n\nBooked by: ${who}`
            : `${data.item.name} is not available for these dates.`,
        );
        return;
      }
      const item = data.item;
      const scanWarnings = data.status.startsWith("WARNING_")
        ? warningsFromScanRecords(data.warningRecords || [])
        : { returning_warning: null, booked_warning: null };
      setSelectedDresses((prev) => [...prev, {
        id: item.id,
        name: item.name,
        category: item.category,
        size: item.size || "",
        color: item.color || "",
        photo: item.photo || "",
        price: 0,
        fittingCharges: 0,
        advance: 0,
        notes: "",
        ...scanWarnings,
      }]);
      setNameSearch("");
      toast?.(`${item.name} added to booking`, "success");
    } catch {
      alert("Failed to look up scanned dress. Please try again.");
    } finally {
      setScanBusy(false);
      setNameSearch("");
      refocusDressSearch();
    }
  }, [scanBusy, deliveryDate, returnDate, deliveryTime, returnTime, props.editId, selectedDresses, toast, refocusDressSearch]);

  const handleDressSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (scanTimer.current) clearTimeout(scanTimer.current);
    if (e.key === "Enter") {
      e.preventDefault();
      const code = scanBuffer.current || e.currentTarget.value;
      scanBuffer.current = "";
      if (code.trim().length >= 4) {
        void handleScanCode(code.trim());
      }
      return;
    }
    if (e.key.length === 1) {
      scanBuffer.current += e.key;
      scanTimer.current = setTimeout(() => { scanBuffer.current = ""; }, 120);
    }
  }, [handleScanCode]);

  const handleDressSearchBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    if (!scanKeepFocusRef.current) return;
    const next = e.relatedTarget as HTMLElement | null;
    if (next?.closest("button, a, select, textarea, input:not([data-dress-scan]), .dress-suggest-item, .dress-picker-scroll")) return;
    refocusDressSearch();
  }, [refocusDressSearch]);

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

  const totalFittingCharges = sumBookingFittingCharges(
    selectedDresses.map((d) => ({ fittingCharges: d.fittingCharges })),
  );

  const totalAdvance = selectedDresses.reduce((s, d) => s + (d.advance || 0), 0);

  const totalRemaining = selectedDresses.reduce(
    (s, d) => s + bookingItemRemaining(d.price, d.advance, d.fittingCharges),
    0,
  );

  const ordersCost = orders.reduce((s, o) => s + (o.cost || 0), 0);

  const ordersAdvance = orders.reduce((s, o) => s + (o.advance || 0), 0);

  const ordersRemaining = orders.reduce((s, o) => s + Math.max(0, (o.cost || 0) - (o.advance || 0)), 0);

  const grandTotalCost = totalPrice + totalFittingCharges + ordersCost;

  const grandTotalAdvance = totalAdvance + ordersAdvance;

  const grandTotalRemaining = totalRemaining + ordersRemaining;



  function applyDeliveryDate(value: string) {
    if (!value) {
      setDeliveryDate("");
      return;
    }
    const next = isDateBeforeToday(value) ? minDate : value.slice(0, 10);
    setDeliveryDate(next);
    setReturnDate(addDaysIso(next, 1));
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
  async function save(opts?: { openPrintSlip?: boolean; downloadSlipPdf?: boolean; openDelivery?: boolean }) {
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

        fitting_charges: d.fittingCharges || 0,

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

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("shop-realtime", {
          detail: {
            type: props.editId ? "booking.updated" : "booking.created",
            bookingId,
          },
        }),
      );
    }

    if (printWindow) {
      printWindow.location.href = `/booking/${bookingId}/slip?print=1`;
    }

    if (opts?.openDelivery && !isProspect) {
      invalidateClientCache();
      toast("✅ Booking saved — opening delivery", "success");
      router.replace(`/booking-delivery/${bookingId}`);
      return;
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
      router.refresh();
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

      <fieldset ref={formRootRef} disabled={readOnly} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>

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

          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3 className="card-title" style={{ margin: 0 }}><i className="fa-solid fa-user-circle" style={{ marginRight: 8 }} />Customer Details</h3>
            {!props.editId && !isProspect && (
              <button
                type="button"
                onClick={() => setShowPreviousCustomers(true)}
                style={{
                  background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8,
                  padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <i className="fa-solid fa-clock-rotate-left" />
                Previous Customers
              </button>
            )}
          </div>

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

            <div className="form-group full-width" style={{ display: "grid", gap: 16 }}>

              <div>
                <label className="form-label">
                  <i className="fa-brands fa-whatsapp" style={{ marginRight: 6 }} />
                  WhatsApp *
                </label>
                <input className="form-control" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
              </div>

              <div>
                <label className="form-label">
                  <i className="fa-solid fa-phone" style={{ marginRight: 6 }} />
                  Contact *
                </label>
                <input className="form-control" inputMode="tel" value={contact1} onChange={(e) => setContact1(e.target.value)} required />
              </div>

            </div>

            <div className="form-group full-width">

              <label className="form-label">Venue</label>

              <input className="form-control" value={venue} onChange={(e) => setVenue(e.target.value)} />

            </div>

            {(props.editId || isProspect) && (
            <div className="form-group full-width">

              <label className="form-label">Security Deposit (₹)</label>

              <input type="number" className="form-control" inputMode="numeric" value={securityDeposit} onChange={(e) => setSecurityDeposit(Number(e.target.value))} onWheel={preventInputWheel} min={0} />

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

              <span className="form-hint">Type DD/MM/YYYY or use the calendar · return date auto-fills to next day</span>

            </div>

            <div className="form-group">

              <label className="form-label">Delivery Time *</label>

              <BookingTimeSelect
                value={deliveryTime}
                onChange={setDeliveryTime}
                times={TIMES}
                aria-label="Delivery time"
              />

            </div>

            <div className="form-group">

              <label className="form-label">Return Date *</label>

              <TypeableDateInput
                min={deliveryDate && deliveryDate >= minDate ? deliveryDate : minDate}
                value={returnDate}
                onChange={applyReturnDate}
              />

              <span className="form-hint">Type DD/MM/YYYY or use the calendar · cannot be before today or delivery date</span>

            </div>

            <div className="form-group">

              <label className="form-label">Return Time *</label>

              <BookingTimeSelect
                value={returnTime}
                onChange={setReturnTime}
                times={TIMES}
                aria-label="Return time"
              />

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

            <div style={{ position: "relative", flex: 1, minWidth: 140, display: "flex", gap: 6 }}>
              <DressNameSuggestInput
                className="form-control"
                placeholder={scanBusy ? "Checking scanned dress…" : "Filter by dress name, SKU, or scan QR…"}
                value={nameSearch}
                category={categoryFilter}
                showPhotos
                clearOnSelect={false}
                minChars={2}
                inputRef={dressSearchInputRef}
                data-dress-scan="1"
                autoComplete="off"
                onChange={(e) => setNameSearch(e.target.value)}
                onKeyDown={handleDressSearchKeyDown}
                onBlur={handleDressSearchBlur}
                onSuggestSelect={(item) => {
                  const base = stripUnitSuffix(item.name || item.display_name || "");
                  if (item.category) setCategoryFilter(item.category);
                  setSizeFilter("");
                  setNameSearch(base || item.name);
                }}
              />
              <button
                type="button"
                title="Scan QR code with camera"
                disabled={scanBusy}
                onClick={() => setShowCameraScanner(true)}
                style={{
                  background: "var(--success)", color: "#fff", border: "none", borderRadius: 8,
                  width: 38, height: 38, cursor: scanBusy ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <i className={scanBusy ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-camera"} />
              </button>
            </div>

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
            <div
              className={`dress-picker-scroll${filtered.length > 8 ? " dress-picker-scroll--long" : ""}`}
              onWheel={(e) => e.stopPropagation()}
            >

              {filtered.map((item) => {

                const sel = selectedDresses.some((d) => d.id === item.id);

                return (

                  <div key={item.id} onClick={() => toggleDress(item)} style={rowStyle(item, sel)}>

                    <BookingPhotoThumb
                      photo={item.photo}
                      size={56}
                      alt={item.display_name || item.name}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>

                      <div style={{ fontWeight: 600 }}>{item.display_name || item.name}</div>

                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>

                        {item.category}{item.size ? ` · Size ${item.size}` : ""}{item.color ? ` · ${item.color}` : ""}
                        {typeof item.free_quantity === "number" && item.free_quantity > 1
                          ? ` · ${item.free_quantity} free`
                          : ""}

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
              <BookingSelectedDressRow
                key={d.id}
                dress={d}
                index={i}
                returningWarning={warn?.returning_warning || d.returning_warning}
                bookedWarning={warn?.booked_warning || d.booked_warning}
                onRemove={removeDress}
                onUpdateField={updateDressField}
              />
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
                      <input type="number" className="form-control" inputMode="numeric" value={o.cost} min={0} onWheel={preventInputWheel} onChange={(e) => updateOrderField(i, "cost", Number(e.target.value))} />
                      {o.cost === 0 && (
                        <span className="form-hint" style={{ color: "var(--gold, #c9a846)" }}>Included in rent</span>
                      )}
                    </div>
                    <div>
                      <label className="form-label">Advance (₹)</label>
                      <input type="number" className="form-control" inputMode="numeric" value={o.advance} min={0} onWheel={preventInputWheel} onChange={(e) => updateOrderField(i, "advance", Number(e.target.value))} />
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
                      <BookingTimeSelect
                        value={o.delivery_time}
                        onChange={(v) => updateOrderField(i, "delivery_time", v)}
                        times={TIMES}
                        aria-label="Order delivery time"
                      />
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

              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Total {ordersCost > 0 ? "(Rent + Fitting + Orders)" : "(Rent + Fitting)"}</div>

              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>₹{formatInr(grandTotalCost)}</div>

              {(totalFittingCharges > 0 || ordersCost > 0) && (
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  Rent ₹{formatInr(totalPrice)}
                  {totalFittingCharges > 0 ? ` · Fitting ₹${formatInr(totalFittingCharges)}` : ""}
                  {ordersCost > 0 ? ` · Orders ₹${formatInr(ordersCost)}` : ""}
                </div>
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
                inputMode="numeric"
                className="form-control"
                value={securityDeposit}
                onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                onWheel={preventInputWheel}
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
          {!isProspect && (
            <button
              type="button"
              className="btn btn-outline btn-lg"
              disabled={saving || !selectedDresses.length || hasHardBlock}
              onClick={() => void save({ openDelivery: true })}
              style={{ color: "var(--primary)", borderColor: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 8 }}
              title="Save booking and open delivery page"
            >
              <i className="fa-solid fa-truck-fast" />
              {saving ? "Saving…" : props.editId ? "Update & Deliver" : "Save & Deliver"}
            </button>
          )}
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

      {showCameraScanner && (
        <BookingScanModal
          onScan={(code) => {
            setShowCameraScanner(false);
            void handleScanCode(code);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {showPreviousCustomers && (
        <PreviousCustomerModal
          initialCustomers={prefetchedCustomers}
          onSelect={(c) => {
            setCustomerName(c.customer_name);
            setCustomerAddress(c.customer_address);
            setContact1(c.contact_1);
            setWhatsapp(c.whatsapp_no);
            setVenue(c.venue);
            setShowPreviousCustomers(false);
            toast?.("Customer details filled from previous booking", "success");
          }}
          onClose={() => setShowPreviousCustomers(false)}
        />
      )}

    </div>

  );

}

function BookingScanModal({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<import("@/lib/cameraScanner").QrCameraSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { QrCameraSession, cameraErrorMessage } = await import("@/lib/cameraScanner");
        if (cancelled) return;
        const session = new QrCameraSession("booking-qr-scan", { qrOnly: true });
        sessionRef.current = session;
        await session.start((code) => {
          if (!cancelled) onScan(code);
        });
      } catch (e) {
        if (!cancelled) {
          const { cameraErrorMessage } = await import("@/lib/cameraScanner");
          setError(cameraErrorMessage(e, location.protocol === "https:"));
        }
      }
    })();
    return () => {
      cancelled = true;
      sessionRef.current?.stop();
    };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, padding: 20, width: "90%", maxWidth: 420,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            <i className="fa-solid fa-qrcode" style={{ marginRight: 8, color: "var(--success)" }} />
            Scan Dress QR Code
          </h3>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div
          id="booking-qr-scan"
          ref={videoRef}
          style={{ width: "100%", minHeight: 260, borderRadius: 12, overflow: "hidden", background: "#111" }}
        />

        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Or type code manually…"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualCode.trim()) {
                onScan(manualCode.trim());
              }
            }}
            style={{ flex: 1, padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
          />
          <button
            type="button"
            disabled={!manualCode.trim()}
            onClick={() => manualCode.trim() && onScan(manualCode.trim())}
            style={{
              background: "var(--success)", color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 16px", cursor: manualCode.trim() ? "pointer" : "not-allowed",
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

type ScanConflictRecord = {
  customerName: string;
  bookingNumber: string;
  monthlySerial?: number;
  deliveryDate?: string;
  deliveryTime?: string;
  returnDate?: string;
  returnTime?: string;
  contact?: string;
  reason?: string;
};

function alternateStatusFromWarnings(
  returning?: WarningInfo | null,
  booked?: WarningInfo | null,
): string | null {
  if (returning && booked) return "WARNING_BOTH_BOUNDARIES";
  if (returning) return "WARNING_RETURNING_ON_DELIVERY_DAY";
  if (booked) return "WARNING_BOOKED_ON_RETURN_DAY";
  return null;
}

function warningInfoToScanRecord(
  w: WarningInfo,
  reason: "RETURNING_ON_DELIVERY_DAY" | "BOOKED_ON_RETURN_DAY",
): ScanConflictRecord {
  return {
    customerName: w.customer_name || w.customer || "",
    bookingNumber: w.booking_number || "",
    monthlySerial: w.serial_no,
    contact: w.contact_1 || w.contact,
    deliveryDate: w.delivery_date,
    deliveryTime: w.delivery_time,
    returnDate: w.return_date,
    returnTime: w.return_time,
    reason,
  };
}

function confirmAlternateDressAdd(
  returning?: WarningInfo | null,
  booked?: WarningInfo | null,
): boolean {
  const status = alternateStatusFromWarnings(returning, booked);
  if (!status) return true;
  const records: ScanConflictRecord[] = [];
  if (returning) records.push(warningInfoToScanRecord(returning, "RETURNING_ON_DELIVERY_DAY"));
  if (booked) records.push(warningInfoToScanRecord(booked, "BOOKED_ON_RETURN_DAY"));
  return window.confirm(formatScanAlternateConfirm(status, records));
}

function scanRecordToWarningInfo(record: ScanConflictRecord): WarningInfo {
  return {
    customer_name: record.customerName,
    serial_no: record.monthlySerial ?? 0,
    contact_1: record.contact,
    delivery_date: record.deliveryDate,
    delivery_time: record.deliveryTime,
    return_date: record.returnDate,
    return_time: record.returnTime,
    booking_number: record.bookingNumber,
  };
}

function warningsFromScanRecords(records: ScanConflictRecord[]) {
  const returning = records.find((r) => r.reason === "RETURNING_ON_DELIVERY_DAY");
  const booked = records.find((r) => r.reason === "BOOKED_ON_RETURN_DAY");
  return {
    returning_warning: returning ? scanRecordToWarningInfo(returning) : null,
    booked_warning: booked ? scanRecordToWarningInfo(booked) : null,
  };
}

function formatScanRecordBlock(record: ScanConflictRecord): string {
  const serial =
    record.monthlySerial != null ? ` #${String(record.monthlySerial).padStart(2, "0")}` : "";
  if (record.reason === "RETURNING_ON_DELIVERY_DAY") {
    return [
      `• ${record.customerName}${serial} (${record.bookingNumber})`,
      `  Returning ${record.returnDate || "—"} by ${record.returnTime || "—"}`,
      record.contact ? `  Contact: ${record.contact}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (record.reason === "BOOKED_ON_RETURN_DAY") {
    return [
      `• ${record.customerName}${serial} (${record.bookingNumber})`,
      `  Delivery ${record.deliveryDate || "—"} at ${record.deliveryTime || "—"}`,
      record.contact ? `  Contact: ${record.contact}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return `• ${record.customerName}${serial} (${record.bookingNumber})`;
}

function formatScanAlternateConfirm(status: string, records: ScanConflictRecord[]): string {
  const returning = records.filter((r) => r.reason === "RETURNING_ON_DELIVERY_DAY");
  const booked = records.filter((r) => r.reason === "BOOKED_ON_RETURN_DAY");
  const other = records.filter(
    (r) => r.reason !== "RETURNING_ON_DELIVERY_DAY" && r.reason !== "BOOKED_ON_RETURN_DAY",
  );

  const sections: string[] = [];
  if (status === "WARNING_BOTH_BOUNDARIES" || returning.length) {
    sections.push(
      ["Returning on your delivery day:", ...returning.map(formatScanRecordBlock)].join("\n"),
    );
  }
  if (status === "WARNING_BOTH_BOUNDARIES" || booked.length) {
    sections.push(
      ["Booked on your return day:", ...booked.map(formatScanRecordBlock)].join("\n"),
    );
  }
  if (other.length) {
    sections.push(other.map(formatScanRecordBlock).join("\n\n"));
  }

  const header =
    status === "WARNING_BOTH_BOUNDARIES"
      ? "Alternate booking — both boundary handovers apply:"
      : status === "WARNING_RETURNING_ON_DELIVERY_DAY"
        ? "Alternate booking — this dress is returning on your delivery day:"
        : status === "WARNING_BOOKED_ON_RETURN_DAY"
          ? "Alternate booking — another customer is booked on your return day:"
          : "Alternate booking — boundary handover warning:";

  const body = sections.filter(Boolean).join("\n\n");
  return `${header}\n\n${body}\n\nAdd this dress to the booking anyway?`;
}

function PreviousCustomerModal({
  onSelect,
  onClose,
  initialCustomers = null,
}: {
  onSelect: (c: PreviousCustomer) => void;
  onClose: () => void;
  initialCustomers?: PreviousCustomer[] | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PreviousCustomer[]>(initialCustomers ?? []);
  const [loading, setLoading] = useState(!initialCustomers?.length);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const reqId = ++reqIdRef.current;
    const trimmed = q.trim();

    if (!trimmed && initialCustomers?.length) {
      setResults(initialCustomers);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const url = trimmed.length >= 2
        ? `/api/booking/customer-lookup?q=${encodeURIComponent(trimmed)}`
        : "/api/booking/customer-lookup";
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json() as { customers?: PreviousCustomer[] };
      if (reqId !== reqIdRef.current) return;
      setResults(data.customers || []);
    } catch (e) {
      if (isAbortError(e)) return;
      if (reqId === reqIdRef.current) setResults([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [initialCustomers]);

  useEffect(() => {
    if (initialCustomers?.length) {
      setResults(initialCustomers);
      setLoading(false);
    }
  }, [initialCustomers]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      const timer = setTimeout(() => void runSearch(trimmed), 250);
      return () => clearTimeout(timer);
    }
    if (initialCustomers?.length) {
      setResults(initialCustomers);
      setLoading(false);
      return;
    }
    void runSearch("");
  }, [query, runSearch, initialCustomers]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, width: "92%", maxWidth: 500, maxHeight: "80vh",
          display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 8, color: "var(--primary)" }} />
              Previous Customers
            </h3>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Search by customer name or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, boxSizing: "border-box" }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 30, color: "#9ca3af" }}>
              <i className="fa-solid fa-spinner fa-spin" /> Searching…
            </div>
          ) : results.length === 0 && query.trim().length >= 2 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#9ca3af", fontSize: 13 }}>No previous customers found.</div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#9ca3af", fontSize: 13 }}>
              No previous customers yet.
            </div>
          ) : (
            <>
              {!query.trim() && (
                <div style={{ padding: "8px 20px 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                  Recent customers
                </div>
              )}
              {results.map((c, i) => (
              <div
                key={`${c.contact_1}-${i}`}
                onClick={() => onSelect(c)}
                style={{
                  padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f3f4f6",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f0fdf4"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1f2937" }}>{c.customer_name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  <i className="fa-solid fa-phone" style={{ marginRight: 4, fontSize: 10 }} />
                  {c.contact_1}
                  {c.whatsapp_no && c.whatsapp_no !== c.contact_1 && (
                    <span style={{ marginLeft: 10 }}>
                      <i className="fa-brands fa-whatsapp" style={{ marginRight: 4, fontSize: 10, color: "#16a34a" }} />
                      {c.whatsapp_no}
                    </span>
                  )}
                </div>
                {c.customer_address && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.customer_address}
                  </div>
                )}
                {c.venue && (
                  <div style={{ fontSize: 11, color: "#6366f1", marginTop: 2 }}>
                    <i className="fa-solid fa-location-dot" style={{ marginRight: 4, fontSize: 9 }} />
                    {c.venue}
                  </div>
                )}
              </div>
              ))}
            </>
          )}
        </div>
      </div>
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


