"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutationOperationId } from "@/lib/useMutationOperationId";
import { compressImageFile, mapPool } from "@/lib/clientImageCompress";
import { useToast } from "@/components/ui/Toast";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import BookingItemWarningsBlock, {
  BookingItemWarningsSection,
  findItemWarnings,
} from "@/components/BookingItemWarningsSection";
import DeliveredCancelBooking from "@/components/DeliveredCancelBooking";
import PhotoCaptureButton from "@/components/PhotoCaptureButton";
import PaymentModePicker, { type PaymentMode } from "@/components/PaymentModePicker";
import ZoomableImage from "@/components/ZoomableImage";
import {
  balanceLeftToCollect,
  effectiveRemainingCollected,
  incompleteReturnSecuritySummary,
  securityCurrentlyHeld,
  sumItemRemainingCollected,
  type BookingForStandardDetails,
} from "@/lib/bookingDetails";
import { isDeliverySlipEligible, isCommonDeliverySlipEligible, isIncompleteSlipEligible, isReturnSlipEligible, isCommonReturnSlipEligible, hasPartialReturn, deliverySlipHref, returnSlipHref } from "@/lib/bookingStatus";
import { navigatePrintTab, openBlankPrintTab, withSlipPrintQuery } from "@/lib/slipPrintUrl";
import type { BookingItemPricingRow } from "@/lib/dress";
import { formatInr } from "@/lib/format";
import { idProofUrl, photoUrl } from "@/lib/photoUrl";
import IncompleteSecuritySummaryBox from "@/components/IncompleteSecuritySummaryBox";
import type { SlipOrderDisplay } from "@/components/BookingSlip";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";

function paymentModeLabel(mode?: string | null): string | null {
  if (mode === "online") return "Online";
  if (mode === "cash") return "Cash";
  return null;
}

type ItemDeliveryRow = {
  id: number;
  itemId?: number | null;
  dressName: string;
  category?: string | null;
  size?: string;
  photo?: string;
  isDelivered: boolean;
  isReturned?: boolean;
  isIncompleteReturn?: boolean;
  isCancelled?: boolean;
  cancelRefundAmount?: number;
  advance?: number;
  isPackedReady?: boolean;
  preparedBy?: string;
  checkedBy?: string;
  packingNote?: string;
  itemRemainingCollected: number;
  itemSecurityCollected: number;
  itemDeliveryNotes?: string | null;
  itemIncompleteNotes?: string | null;
  itemIncompletePhoto?: string | null;
  itemSecurityHeld?: number;
};

type OrderCollectRow = {
  id: number;
  description: string;
  cost: number;
  advance: number;
  balance: number;
  balanceCollected: number;
  photo?: string | null;
  deliveryDate: string;
  deliveryTime: string;
  includedInRent: boolean;
};

type IncompleteDressForm = {
  selected: boolean;
  notes: string;
  securityHeld: string;
  photoFile: File | null;
  photoPreview: string | null;
};

function defaultIncompleteForm(row: ItemDeliveryRow, autoSelect: boolean): IncompleteDressForm {
  return {
    selected: autoSelect,
    notes: "",
    securityHeld: String(row.itemSecurityCollected || ""),
    photoFile: null,
    photoPreview: null,
  };
}

function isItemReturnable(row: ItemDeliveryRow, bookingDelivered: boolean) {
  if (row.isCancelled || row.isReturned) return false;
  return row.isDelivered || bookingDelivered;
}

export default function ReturnDetailClient({
  booking,
  items,
  itemDelivery = [],
  warningItems = [],
  orders = [],
  orderRecords = [],
}: {
  booking: BookingForStandardDetails & {
    id: number;
    monthlySerial: number;
    status: string;
    remainingCollected: number;
    securityCollected: number;
    securityHeld?: number;
    incompleteNotes?: string | null;
    incompletePhoto?: string | null;
    idPhoto1?: string | null;
    idPhoto2?: string | null;
    totalPrice?: number;
    price?: number;
    totalAdvance?: number;
    advance?: number;
    totalRemaining?: number;
    remaining?: number;
    securityDeposit?: number;
    deliveryNotes?: string | null;
    securityPaymentMode?: string | null;
  };
  items: BookingItemPricingRow[];
  itemDelivery?: ItemDeliveryRow[];
  warningItems?: ItemWarningSource[];
  orders?: SlipOrderDisplay[];
  orderRecords?: OrderCollectRow[];
}) {
  const router = useRouter();
  const allItemsDelivered = itemDelivery.length > 0 ? itemDelivery.every((d) => d.isDelivered) : false;
  const isDelivered = booking.status === "delivered" || (booking.status === "booked" && allItemsDelivered);
  const hasAnyDeliveredDress =
    booking.status === "delivered" ||
    itemDelivery.some((d) => d.isDelivered) ||
    (itemDelivery.length === 0 && isDelivered);
  const securityHeldAmount = securityCurrentlyHeld({
    status: booking.status,
    securityHeld: booking.securityHeld,
    securityCollected: booking.securityCollected,
    securityDeposit: booking.securityDeposit,
    items: itemDelivery,
    dressIsOut: hasAnyDeliveredDress,
  });
  const securityPaymentLabel = paymentModeLabel(booking.securityPaymentMode);

  const bookingIsDelivered = booking.status === "delivered";
  const returnableItems = useMemo(
    () => itemDelivery.filter((d) => isItemReturnable(d, bookingIsDelivered)),
    [itemDelivery, bookingIsDelivered],
  );

  const deliveredItems = useMemo(
    () => itemDelivery.filter((d) => (d.isDelivered || bookingIsDelivered) && !d.isCancelled),
    [itemDelivery, bookingIsDelivered],
  );
  const returnedItems = useMemo(
    () => deliveredItems.filter((d) => d.isReturned),
    [deliveredItems],
  );
  const pendingReturnCount = returnableItems.length;
  const multiDress = deliveredItems.length > 1;
  /** Partial delivery keeps status "booked" — still allow returning dresses that are out. */
  const canMarkReturn =
    hasAnyDeliveredDress &&
    pendingReturnCount > 0 &&
    booking.status !== "returned" &&
    booking.status !== "cancelled" &&
    booking.status !== "incomplete_return";
  const undeliveredItems = useMemo(
    () =>
      booking.status === "delivered"
        ? []
        : itemDelivery.filter((d) => !d.isDelivered && !d.isCancelled),
    [itemDelivery, booking.status],
  );
  const cancelledItems = useMemo(
    () => itemDelivery.filter((d) => d.isCancelled),
    [itemDelivery],
  );
  const isPartialDeliveryOut = undeliveredItems.length > 0 && deliveredItems.length > 0;
  const deliveredIdSet = useMemo(
    () => new Set(deliveredItems.map((d) => d.id).filter((id) => id > 0)),
    [deliveredItems],
  );
  /** Billing / dress table: delivered dresses only while some are still pending delivery. */
  const billingItems = useMemo(() => {
    if (!isPartialDeliveryOut) return items;
    const byId = items.filter((row) => row.id != null && deliveredIdSet.has(row.id));
    if (byId.length) return byId;
    const names = new Set(deliveredItems.map((d) => d.dressName.trim().toLowerCase()));
    return items.filter((row) => names.has(row.display_name.trim().toLowerCase()) || names.has(row.display_name.split(" · ")[0]?.trim().toLowerCase() || ""));
  }, [items, isPartialDeliveryOut, deliveredIdSet, deliveredItems]);
  const scopedTotalPrice = useMemo(
    () => (isPartialDeliveryOut ? billingItems.reduce((s, r) => s + (r.price || 0), 0) : (booking.totalPrice ?? booking.price ?? 0)),
    [isPartialDeliveryOut, billingItems, booking.totalPrice, booking.price],
  );
  const scopedTotalAdvance = useMemo(
    () => (isPartialDeliveryOut ? billingItems.reduce((s, r) => s + (r.advance || 0), 0) : (booking.totalAdvance ?? booking.advance ?? 0)),
    [isPartialDeliveryOut, billingItems, booking.totalAdvance, booking.advance],
  );
  const scopedTotalRemaining = useMemo(
    () => (isPartialDeliveryOut ? billingItems.reduce((s, r) => s + (r.remaining || 0), 0) : (booking.totalRemaining ?? booking.remaining ?? 0)),
    [isPartialDeliveryOut, billingItems, booking.totalRemaining, booking.remaining],
  );
  const returnRecordBooking = useMemo(() => {
    if (!isPartialDeliveryOut) return booking;
    return {
      ...booking,
      totalPrice: scopedTotalPrice,
      price: scopedTotalPrice,
      totalAdvance: scopedTotalAdvance,
      advance: scopedTotalAdvance,
      totalRemaining: scopedTotalRemaining,
      remaining: scopedTotalRemaining,
      dressName: deliveredItems.map((d) => d.dressName).join(", "),
      bookingItems: (
        ((booking as { bookingItems?: Array<{ id?: number }> }).bookingItems || []).filter(
          (bi) => typeof bi.id === "number" && deliveredIdSet.has(bi.id),
        ) as Array<{ id: number }>
      ),
    };
  }, [
    booking,
    isPartialDeliveryOut,
    scopedTotalPrice,
    scopedTotalAdvance,
    scopedTotalRemaining,
    deliveredItems,
    deliveredIdSet,
  ]);
  const returnSlipSource = {
    status: booking.status,
    bookingItems: itemDelivery.map((d) => ({
      id: d.id,
      isDelivered: d.isDelivered,
      isReturned: d.isReturned,
      isIncompleteReturn: d.isIncompleteReturn,
      isCancelled: d.isCancelled,
    })),
  };
  const slipStatusSource = {
    status: booking.status,
    bookingItems: itemDelivery.map((d) => ({
      id: d.id,
      isDelivered: d.isDelivered,
    })),
  };
  const incompleteSlipSource = {
    status: booking.status,
    bookingItems: itemDelivery.map((d) => ({
      isIncompleteReturn: d.isIncompleteReturn,
    })),
  };
  const partialReturn = hasPartialReturn(returnSlipSource);

  const [incompleteForms, setIncompleteForms] = useState<Record<number, IncompleteDressForm>>({});
  const [returnError, setReturnError] = useState("");
  const [selectedToReturn, setSelectedToReturn] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setIncompleteForms((prev) => {
      const next: Record<number, IncompleteDressForm> = {};
      const autoSelect = returnableItems.length === 1;
      for (const row of returnableItems) {
        next[row.id] = prev[row.id] ?? defaultIncompleteForm(row, autoSelect);
      }
      return next;
    });
    setSelectedToReturn((prev) => {
      const next: Record<number, boolean> = {};
      const autoSelect = returnableItems.length === 1;
      for (const row of returnableItems) {
        next[row.id] = prev[row.id] ?? autoSelect;
      }
      return next;
    });
  }, [returnableItems]);
  const [saving, setSaving] = useState(false);
  const op = useMutationOperationId();
  const toast = useToast();
  const [photoProgress, setPhotoProgress] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [incompleteError, setIncompleteError] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [localOrders, setLocalOrders] = useState<OrderCollectRow[]>(orderRecords);
  useEffect(() => {
    setLocalOrders(orderRecords);
  }, [orderRecords]);
  const [orderForms, setOrderForms] = useState<Record<number, string>>({});
  const [orderModes, setOrderModes] = useState<Record<number, PaymentMode>>({});
  const [orderBusy, setOrderBusy] = useState<number | null>(null);
  const [orderError, setOrderError] = useState("");

  const outstandingOrders = localOrders.filter(
    (o) => !o.includedInRent && Math.max(0, o.balance - o.balanceCollected) > 0,
  );

  async function collectOrder(orderId: number) {
    const o = localOrders.find((x) => x.id === orderId);
    if (!o) return;
    const outstanding = Math.max(0, o.balance - o.balanceCollected);
    const amount = Number(orderForms[orderId] ?? outstanding) || 0;
    if (amount <= 0) return;
    const mode = orderModes[orderId] || "cash";
    setOrderBusy(orderId);
    setOrderError("");
    try {
      const res = await fetch(`/api/booking/${booking.id}/orders/${orderId}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance_collected: amount, payment_mode: mode }),
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrderError(typeof data.error === "string" ? data.error : "Failed to collect order balance");
        return;
      }
      const newCollected = data.order?.balanceCollected ?? o.balanceCollected + amount;
      setLocalOrders((prev) => prev.map((x) => (x.id === orderId ? { ...x, balanceCollected: newCollected } : x)));
      setOrderForms((prev) => ({ ...prev, [orderId]: "" }));
      router.refresh();
    } finally {
      setOrderBusy(null);
    }
  }

  const anyIncompleteSelected = returnableItems.some((r) => incompleteForms[r.id]?.selected);
  const selectedReturnIds = returnableItems
    .filter((r) => selectedToReturn[r.id])
    .map((r) => r.id);
  const selectedReturnCount = selectedReturnIds.length;

  const totalPrice = scopedTotalPrice;
  const totalAdvance = scopedTotalAdvance;
  const totalRemaining = scopedTotalRemaining;
  const collectedAtDelivery = isPartialDeliveryOut
    ? sumItemRemainingCollected(deliveredItems)
    : effectiveRemainingCollected(booking.remainingCollected, itemDelivery);
  const balanceLeft = balanceLeftToCollect(totalRemaining, collectedAtDelivery);
  const rentCollectedPart = Math.min(collectedAtDelivery, totalRemaining);
  const orderCollectedPart = Math.max(0, collectedAtDelivery - rentCollectedPart);
  const showOrderBreakdown = orders.length > 0 && orderCollectedPart > 0 && !isPartialDeliveryOut;

  const pendingReturnStatusCards = useMemo(
    () =>
      itemDelivery.filter(
        (d) => (d.isDelivered || bookingIsDelivered) && !d.isReturned && !d.isIncompleteReturn,
      ),
    [itemDelivery, bookingIsDelivered],
  );
  const returnedStatusCards = useMemo(
    () => itemDelivery.filter((d) => d.isDelivered && d.isReturned),
    [itemDelivery],
  );
  const showReturnedInStatus =
    returnedStatusCards.length > 0 &&
    (balanceLeft > 0 || securityHeldAmount > 0 || partialReturn || booking.status === "incomplete_return");
  const deliveryStatusCards = [
    ...pendingReturnStatusCards,
    ...(showReturnedInStatus ? returnedStatusCards : []),
  ];

  const incompleteSecurity = incompleteReturnSecuritySummary({
    securityHeld: booking.securityHeld,
    securityCollected: booking.securityCollected,
    securityDeposit: booking.securityDeposit,
    items: itemDelivery,
  });

  function toggleReturnSelect(id: number, selected: boolean) {
    setSelectedToReturn((prev) => ({ ...prev, [id]: selected }));
    setReturnError("");
  }

  function selectAllReturnable(selected: boolean) {
    setSelectedToReturn((prev) => {
      const next = { ...prev };
      for (const row of returnableItems) next[row.id] = selected;
      return next;
    });
  }

  function toggleIncompleteDress(id: number, selected: boolean) {
    setIncompleteForms((prev) => {
      const row = returnableItems.find((r) => r.id === id);
      const base = prev[id] ?? (row ? defaultIncompleteForm(row, false) : {
        selected: false,
        notes: "",
        securityHeld: "",
        photoFile: null,
        photoPreview: null,
      });
      return { ...prev, [id]: { ...base, selected } };
    });
    setIncompleteError("");
  }

  function updateIncompleteForm(id: number, patch: Partial<IncompleteDressForm>) {
    setIncompleteForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  function onIncompletePhotoChange(id: number, file: File | null) {
    setIncompleteForms((prev) => {
      const old = prev[id];
      if (old?.photoPreview) URL.revokeObjectURL(old.photoPreview);
      return {
        ...prev,
        [id]: {
          ...old,
          photoFile: file,
          photoPreview: file ? URL.createObjectURL(file) : null,
        },
      };
    });
  }

  async function cancelDress(itemId: number, refundAdvance: boolean) {
    setCancelBusy(true);
    setReturnError("");
    try {
      const res = await fetch(`/api/booking/${booking.id}/items/${itemId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund_advance: refundAdvance }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReturnError(typeof data.error === "string" ? data.error : "Cancel failed");
        return;
      }
      setCancellingId(null);
      router.refresh();
    } finally {
      setCancelBusy(false);
    }
  }

  async function act(action: string, bookingItemId?: number, opts?: { openPrintSlip?: boolean }) {
    const operationId = op.begin(`return:${action}:${bookingItemId || "all"}`);
    if (!operationId) return;
    setReturnError("");
    setSaving(true);
    const printWindow = opts?.openPrintSlip ? openBlankPrintTab() : null;
    try {
      const res = await fetch(`/api/return/${booking.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          operation_id: operationId,
          ...(bookingItemId ? { booking_item_id: bookingItemId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        printWindow?.close();
        setReturnError(typeof data.error === "string" ? data.error : "Save failed");
        op.fail({ clearId: res.status === 409 });
        return;
      }
      op.succeed();
      if (data.slip_queued) toast("Return saved — receipt queued for WhatsApp", "success");
      if (opts?.openPrintSlip) {
        const href = bookingItemId
          ? returnSlipHref(booking.id, returnSlipSource, bookingItemId)
          : returnSlipHref(booking.id, {
              status: data.status ?? "returned",
              bookingItems: returnSlipSource.bookingItems?.map((row) => ({
                ...row,
                isReturned: true,
              })),
            });
        navigatePrintTab(printWindow, href);
      }
      router.refresh();
    } catch (e) {
      printWindow?.close();
      setReturnError(e instanceof Error ? e.message : "Network error — tap again to retry");
      op.fail();
    } finally {
      setSaving(false);
    }
  }

  /** Save selected dresses as returned and send slip for only those (1 = single, 2+ = combined). */
  async function saveSelectedReturns(opts?: { openPrintSlip?: boolean }) {
    const ids = selectedReturnIds;
    if (!ids.length) {
      setReturnError("Select at least one dress to return, then press Save.");
      return;
    }
    const operationId = op.begin(`return:selected:${ids.slice().sort((a, b) => a - b).join(",")}`);
    if (!operationId) return;
    setReturnError("");
    setSaving(true);
    const printWindow = opts?.openPrintSlip ? openBlankPrintTab() : null;
    try {
      const res = await fetch(`/api/return/${booking.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_items_returned",
          operation_id: operationId,
          booking_item_ids: ids,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        printWindow?.close();
        setReturnError(typeof data.error === "string" ? data.error : "Save failed");
        op.fail({ clearId: res.status === 409 });
        return;
      }
      op.succeed();
      if (data.slip_queued) toast("Return saved — receipt queued for WhatsApp", "success");
      setSelectedToReturn({});
      if (opts?.openPrintSlip) {
        const mergedSource = {
          status: data.status ?? booking.status,
          bookingItems: returnSlipSource.bookingItems?.map((row) =>
            row.id != null && ids.includes(row.id)
              ? { ...row, isReturned: true, isIncompleteReturn: false }
              : row,
          ),
        };
        navigatePrintTab(
          printWindow,
          returnSlipHref(
            booking.id,
            mergedSource,
            ids.length === 1 ? ids[0] : undefined,
            ids,
          ),
        );
      }
      router.refresh();
    } catch (e) {
      printWindow?.close();
      setReturnError(e instanceof Error ? e.message : "Network error — tap again to retry");
      op.fail();
    } finally {
      setSaving(false);
    }
  }

  async function submitIncompleteReturn() {
    if (returnableItems.length > 0 && !anyIncompleteSelected) {
      setIncompleteError("Select at least one dress for incomplete return.");
      return;
    }

    const operationId = op.begin(`return:incomplete:${booking.id}`);
    if (!operationId) return;
    setIncompleteError("");
    setPhotoProgress("Compressing photos…");
    setSaving(true);
    try {
      const form = new FormData();
      form.append("action", "incomplete_return");
      form.append("operation_id", operationId);

      if (returnableItems.length === 1 && returnableItems[0].id === 0) {
        const f = incompleteForms[0];
        form.append("incomplete_notes", f?.notes || "");
        form.append("security_held", String(Number(f?.securityHeld) || 0));
        if (f?.photoFile) {
          const compressed = await compressImageFile(f.photoFile);
          form.append("incomplete_photo", compressed);
        }
      } else {
        const items = returnableItems.map((row) => ({
          booking_item_id: row.id,
          is_incomplete: Boolean(incompleteForms[row.id]?.selected),
          incomplete_notes: incompleteForms[row.id]?.notes || "",
          security_held: Number(incompleteForms[row.id]?.securityHeld) || 0,
        }));
        form.append("items", JSON.stringify(items));
        const photoRows = returnableItems.filter(
          (row) => incompleteForms[row.id]?.selected && incompleteForms[row.id]?.photoFile,
        );
        setPhotoProgress("Uploading photos…");
        const compressedFiles = await mapPool(photoRows, 2, async (row) => {
          const file = incompleteForms[row.id]!.photoFile!;
          return { rowId: row.id, file: await compressImageFile(file) };
        });
        for (const { rowId, file } of compressedFiles) {
          form.append(`item_photo_${rowId}`, file);
        }
      }

      setPhotoProgress("Saving return…");
      const res = await fetch(`/api/return/${booking.id}/save`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setIncompleteError(data.error || "Save failed");
        op.fail({ clearId: res.status === 409 });
        return;
      }
      op.succeed();
      setPhotoProgress("Return completed");
      if (data.slip_queued) toast("Incomplete return saved — slip queued", "success");
      router.refresh();
    } catch (e) {
      setIncompleteError(e instanceof Error ? e.message : "Network error — tap again to retry");
      op.fail();
    } finally {
      setSaving(false);
      setTimeout(() => setPhotoProgress(""), 1500);
    }
  }

  return (
    <div>
      <div style={{ display: "flex",gap: 12, marginBottom: 16, flexWrap: "wrap" }} className="no-print">
        <Link href={`/booking/${booking.id}`} className="btn btn-outline">View Booking</Link>
        <Link
          href={`/booking/${booking.id}/customer-slips`}
          className="btn btn-outline"
          style={{ color: "#5b21b6", borderColor: "#7c3aed" }}
          title="View booking, delivery and return slips sent to the customer"
        >
          <i className="fa-solid fa-file-pdf" style={{ marginRight: 6 }} />
          All Customer Slips
        </Link>
        {isDeliverySlipEligible(slipStatusSource) && isCommonDeliverySlipEligible(slipStatusSource) && (
          <>
            <Link href={deliverySlipHref(booking.id, slipStatusSource)} className="btn btn-outline" style={{ color: "#1565c0", borderColor: "#1565c0" }}>
              <i className="fa-solid fa-truck-fast" style={{ marginRight: 6 }} />Delivery Slip
            </Link>
            <Link
              href={withSlipPrintQuery(deliverySlipHref(booking.id, slipStatusSource))}
              className="btn btn-outline"
              style={{ color: "#1565c0", borderColor: "#1565c0" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fa-solid fa-print" style={{ marginRight: 6 }} />Print Delivery Slip
            </Link>
          </>
        )}
        {isReturnSlipEligible(returnSlipSource) && (
          <>
            <Link href={returnSlipHref(booking.id, returnSlipSource)} className="btn btn-outline" style={{ color: "#b8860b", borderColor: "#c9a84c" }}>
              <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
              Return Receipt
              {returnedItems.length === 1 && undeliveredItems.length > 0
                ? ` — ${returnedItems[0].dressName}`
                : returnedItems.length > 1 && !isCommonReturnSlipEligible(returnSlipSource)
                  ? ` (${returnedItems.length} dresses)`
                  : ""}
            </Link>
            <Link
              href={withSlipPrintQuery(returnSlipHref(booking.id, returnSlipSource))}
              className="btn btn-outline"
              style={{ color: "#b8860b", borderColor: "#c9a84c" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fa-solid fa-print" style={{ marginRight: 6 }} />Print A4 Slip
            </Link>
          </>
        )}
        {isIncompleteSlipEligible(incompleteSlipSource) && (
          <Link href={`/booking/${booking.id}/incomplete-slip`} className="btn btn-outline" style={{ color: "#c2410c", borderColor: "#f39c12" }}>
            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />Incomplete Slip
          </Link>
        )}
        {booking.status !== "returned" && booking.status !== "cancelled" && (
          <Link
            href={booking.status === "delivered" ? `/booking-delivery/${booking.id}` : `/booking/${booking.id}/edit`}
            className="btn btn-outline"
          >
            {booking.status === "delivered" ? "Edit (Delivery)" : "Edit"}
          </Link>
        )}
        {booking.status === "booked" && (
          <Link href={`/booking-delivery/${booking.id}`} className="btn btn-primary">
            <i className="fa-solid fa-truck-fast" /> Delivery
          </Link>
        )}
        {isDelivered && !showCancel && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ color: "var(--danger)" }}
            onClick={() => setShowCancel(true)}
          >
            Cancel Booking
          </button>
        )}
      </div>

      {showCancel && isDelivered && (
        <DeliveredCancelBooking
          bookingId={booking.id}
          totalPrice={totalPrice}
          totalAdvance={totalAdvance}
          totalRemaining={totalRemaining}
          remainingCollected={booking.remainingCollected ?? 0}
          variant="inline"
          onDismiss={() => setShowCancel(false)}
        />
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-id-card" style={{ marginRight: 8 }} />
            Customer ID Photos
          </h3>
        </div>
        <div className="card-body">
          {booking.idPhoto1 || booking.idPhoto2 ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {booking.idPhoto1 && (
                <a href={idProofUrl(booking.idPhoto1)} target="_blank" rel="noreferrer">
                  <img
                    src={idProofUrl(booking.idPhoto1)}
                    alt="Customer ID 1"
                    style={{
                      width: 160,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                </a>
              )}
              {booking.idPhoto2 && (
                <a href={idProofUrl(booking.idPhoto2)} target="_blank" rel="noreferrer">
                  <img
                    src={idProofUrl(booking.idPhoto2)}
                    alt="Customer ID 2"
                    style={{
                      width: 160,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  />
                </a>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
              No ID photos on file for this booking. Capture them on the delivery page (they upload
              automatically when you take the photo).
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            Return — #{String(booking.monthlySerial).padStart(2, "0")} {booking.customerName}
          </h3>
          <span className={`badge badge-${
            booking.status === "delivered"
              ? "warning"
              : booking.status === "incomplete_return"
                ? "incomplete_return"
                : isPartialDeliveryOut
                  ? "warning"
                  : "success"
          }`}>
            {isPartialDeliveryOut
              ? `PARTIAL DELIVERY · ${deliveredItems.length}/${itemDelivery.length}`
              : booking.status.toUpperCase()}
          </span>
        </div>
        <div className="card-body">
          <BookingRecordDetails
            booking={returnRecordBooking as BookingForStandardDetails}
            items={billingItems}
            remainingCollected={collectedAtDelivery}
            warningItems={warningItems.length > 1 ? warningItems : undefined}
            orders={orders}
            extra={
            <>
              {undeliveredItems.length > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: "rgba(192,57,43,0.06)",
                    border: "1.5px solid rgba(192,57,43,0.35)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <i className="fa-solid fa-triangle-exclamation" style={{ color: "var(--danger)" }} />
                    <strong style={{ color: "var(--danger)" }}>
                      Not delivered yet ({undeliveredItems.length})
                    </strong>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Excluded from return billing below — cancel if the customer will not take them
                    </span>
                    <Link
                      href={`/booking-delivery/${booking.id}`}
                      className="btn btn-outline btn-sm"
                      style={{ marginLeft: "auto" }}
                    >
                      <i className="fa-solid fa-truck-fast" style={{ marginRight: 6 }} />
                      Go to Delivery
                    </Link>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {undeliveredItems.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "#fff",
                          border: "1px dashed rgba(192,57,43,0.4)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          {d.photo && (
                            <img
                              src={photoUrl(d.photo)}
                              alt=""
                              style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 120 }}>
                            <strong>{d.dressName}</strong>
                            {(d.category || d.size) && (
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                {[d.category, d.size].filter(Boolean).join(" · ")}
                                {typeof d.advance === "number" && d.advance > 0
                                  ? ` · Advance ₹${formatInr(d.advance)}`
                                  : ""}
                              </div>
                            )}
                          </div>
                          <span className="badge badge-warning">Not delivered</span>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={cancelBusy || saving}
                            onClick={() => setCancellingId(cancellingId === d.id ? null : d.id)}
                            style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                          >
                            <i className="fa-solid fa-ban" style={{ marginRight: 6 }} />
                            Cancel
                          </button>
                        </div>
                        {cancellingId === d.id && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--danger)", fontSize: 13 }}>
                              Cancel {d.dressName}? Advance ₹{formatInr(d.advance || 0)}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={cancelBusy}
                                onClick={() => void cancelDress(d.id, true)}
                              >
                                Refunded
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={cancelBusy}
                                onClick={() => void cancelDress(d.id, false)}
                                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                              >
                                Not Refunded
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={cancelBusy}
                                onClick={() => setCancellingId(null)}
                              >
                                Back
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cancelledItems.length > 0 && (
                <div
                  style={{
                    marginTop: 16,
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: "rgba(192,57,43,0.04)",
                    border: "1px solid rgba(192,57,43,0.25)",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 10 }}>
                    <i className="fa-solid fa-ban" style={{ marginRight: 8 }} />
                    Cancelled dresses ({cancelledItems.length})
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {cancelledItems.map((d) => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                        {d.photo && (
                          <img src={photoUrl(d.photo)} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", opacity: 0.6 }} />
                        )}
                        <strong style={{ flex: 1 }}>{d.dressName}</strong>
                        <span className="badge" style={{ background: "rgba(192,57,43,0.12)", color: "var(--danger)" }}>
                          Cancelled{(d.cancelRefundAmount || 0) > 0 ? " · Adv refunded" : " · Adv kept"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div
                style={{
                  marginTop: 16,
                  marginBottom: 4,
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "var(--cream-dark, #fafafa)",
                  border: "1px solid var(--border)",
                }}
              >
                {isPartialDeliveryOut && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                    Finance for <strong>delivered dresses only</strong>
                    {undeliveredItems.length > 0
                      ? ` (${deliveredItems.length} of ${itemDelivery.length})`
                      : ""}
                    . Undelivered remaining is not included.
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      padding: "18px 20px",
                      borderRadius: 12,
                      background: balanceLeft > 0 ? "rgba(192,57,43,0.1)" : "rgba(46,125,50,0.1)",
                      border: `2.5px solid ${balanceLeft > 0 ? "var(--danger)" : "var(--success)"}`,
                      boxShadow: balanceLeft > 0
                        ? "0 2px 10px rgba(192,57,43,0.12)"
                        : "0 2px 10px rgba(46,125,50,0.1)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        color: balanceLeft > 0 ? "var(--danger)" : "var(--success)",
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <i className={`fa-solid ${balanceLeft > 0 ? "fa-circle-exclamation" : "fa-circle-check"}`} />
                      BALANCE LEFT TO COLLECT
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        lineHeight: 1.1,
                        color: balanceLeft > 0 ? "var(--danger)" : "var(--success)",
                      }}
                    >
                      {balanceLeft > 0 ? `₹${formatInr(balanceLeft)}` : "Paid ✓"}
                    </div>
                  </div>

                  {booking.status !== "returned" && booking.status !== "cancelled" && (
                    <div
                      style={{
                        padding: "18px 20px",
                        borderRadius: 12,
                        background: securityHeldAmount > 0 ? "rgba(21,101,192,0.1)" : "rgba(0,0,0,0.03)",
                        border: `2.5px solid ${securityHeldAmount > 0 ? "#1565c0" : "var(--border)"}`,
                        boxShadow: securityHeldAmount > 0 ? "0 2px 10px rgba(21,101,192,0.14)" : "none",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          color: securityHeldAmount > 0 ? "#1565c0" : "var(--text-muted)",
                          marginBottom: 8,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <i className="fa-solid fa-shield-halved" />
                        SECURITY HELD
                      </div>
                      <div
                        style={{
                          fontSize: 36,
                          fontWeight: 800,
                          lineHeight: 1.1,
                          color: securityHeldAmount > 0 ? "#1565c0" : "var(--text-muted)",
                        }}
                      >
                        ₹{formatInr(securityHeldAmount)}
                      </div>
                      {securityHeldAmount > 0 && securityPaymentLabel && (
                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                          Until return · via {securityPaymentLabel}
                        </div>
                      )}
                      {securityHeldAmount > 0 && !securityPaymentLabel && (
                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                          Held until return
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 14,
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                      {isPartialDeliveryOut ? "REMAINING (DELIVERED)" : "TOTAL REMAINING (BOOKING)"}
                    </div>
                    <strong>₹{formatInr(totalRemaining)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4 }}>
                      COLLECTED AT DELIVERY
                    </div>
                    <strong style={{ color: "var(--success)" }}>₹{formatInr(collectedAtDelivery)}</strong>
                    {showOrderBreakdown && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        ₹{formatInr(rentCollectedPart)} rent + ₹{formatInr(orderCollectedPart)} custom order
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {securityHeldAmount > 0 && booking.status !== "returned" && booking.status !== "cancelled" && booking.securityCollected > 0 && (booking.securityDeposit ?? 0) > booking.securityCollected && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      padding: "10px 14px",
                      background: "rgba(21,101,192,0.08)",
                      borderRadius: 8,
                      border: "1px solid rgba(21,101,192,0.25)",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>SECURITY DETAIL </span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      ₹{formatInr(booking.securityCollected)} collected at delivery
                      {securityPaymentLabel ? ` · ${securityPaymentLabel}` : ""}
                      {" · "}deposit ₹{formatInr(booking.securityDeposit ?? 0)}
                    </span>
                  </div>
                )}
                {booking.deliveryNotes && (
                  <div style={{ marginTop: 8, fontSize: 13, padding: "8px 12px", background: "var(--info-bg, #e8f4fd)", borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>DELIVERY NOTES </span>
                    {booking.deliveryNotes}
                  </div>
                )}
                {(booking.idPhoto1 || booking.idPhoto2) && (
                  <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "rgba(90,20,51,0.04)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, marginBottom: 10 }}>
                      <i className="fa-solid fa-id-card" style={{ marginRight: 6 }} />
                      CUSTOMER ID PHOTOS
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {booking.idPhoto1 && (
                        <a href={idProofUrl(booking.idPhoto1)} target="_blank" rel="noreferrer">
                          <img
                            src={idProofUrl(booking.idPhoto1)}
                            alt="Customer ID 1"
                            style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                          />
                        </a>
                      )}
                      {booking.idPhoto2 && (
                        <a href={idProofUrl(booking.idPhoto2)} target="_blank" rel="noreferrer">
                          <img
                            src={idProofUrl(booking.idPhoto2)}
                            alt="Customer ID 2"
                            style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                          />
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {deliveryStatusCards.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      padding: "12px 14px",
                      border: `1px solid ${
                        d.isReturned
                          ? "var(--border)"
                          : d.isIncompleteReturn
                            ? "rgba(243,156,18,0.5)"
                            : "rgba(192,57,43,0.35)"
                      }`,
                      borderRadius: 8,
                      background: d.isReturned
                        ? "rgba(46,125,50,0.03)"
                        : d.isIncompleteReturn
                          ? "rgba(243,156,18,0.06)"
                          : "rgba(192,57,43,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      {d.photo && (
                        <img src={photoUrl(d.photo)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                      )}
                      <div>
                        <strong>{d.dressName}</strong>
                        {(d.category || d.size) && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {[d.category, d.size].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <span
                        className={`badge ${
                          d.isReturned
                            ? "badge-success"
                            : d.isIncompleteReturn
                              ? "badge-incomplete_return"
                              : "badge-warning"
                        }`}
                        style={{ marginLeft: "auto" }}
                      >
                        {d.isReturned
                          ? "Returned"
                          : d.isIncompleteReturn
                            ? "Incomplete"
                            : "Out — awaiting return"}
                      </span>
                    </div>
                    {(d.preparedBy || d.checkedBy || d.packingNote || d.isPackedReady) && (
                      <div style={{ marginBottom: 8, padding: "8px 12px", background: "var(--info-bg, #e8f4fd)", borderRadius: 8, fontSize: 12 }}>
                        <strong style={{ fontSize: 11, color: "var(--text-muted)" }}>PACKING INFO</strong>
                        {d.isPackedReady && <div>Status: Packed &amp; ready</div>}
                        {d.preparedBy && <div>Prepared by: {d.preparedBy}</div>}
                        {d.checkedBy && <div>Checked by: {d.checkedBy}</div>}
                        {d.packingNote && <div>Note: {d.packingNote}</div>}
                      </div>
                    )}
                    {(d.itemRemainingCollected > 0 || d.itemSecurityCollected > 0) && (
                      <div style={{ fontSize: 12 }}>
                        {d.itemRemainingCollected > 0 && <span>Remaining collected ₹{formatInr(d.itemRemainingCollected)}</span>}
                        {d.itemRemainingCollected > 0 && d.itemSecurityCollected > 0 && <span> · </span>}
                        {d.itemSecurityCollected > 0 && (
                          <span>
                            Security held ₹{formatInr(d.itemSecurityCollected)}
                            {securityPaymentLabel ? ` (${securityPaymentLabel})` : ""}
                          </span>
                        )}
                      </div>
                    )}
                    {d.itemDeliveryNotes && (
                      <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 12 }}>
                        <strong>Delivery note:</strong> {d.itemDeliveryNotes}
                      </div>
                    )}
                    {d.isReturned && (partialReturn || undeliveredItems.length > 0) && (
                      <div style={{ marginTop: 10 }}>
                        <Link
                          href={returnSlipHref(booking.id, returnSlipSource, d.id)}
                          className="btn btn-outline btn-sm"
                          style={{ color: "#b8860b", borderColor: "#c9a84c" }}
                        >
                          <i className="fa-solid fa-receipt" style={{ marginRight: 6 }} />
                          Return Receipt
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
                {pendingReturnStatusCards.length > 0 && showReturnedInStatus && returnedStatusCards.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                    Pending return shown first. Already-returned dresses listed below while balance or security is still open.
                  </div>
                )}
              </>
            }
          />
          {warningItems.length <= 1 && <BookingItemWarningsSection items={warningItems} />}
        </div>
      </div>

      {outstandingOrders.length > 0 && booking.status !== "cancelled" && (
        <div className="card" style={{ marginBottom: 24, overflow: "visible", borderLeft: "4px solid #c9a84c" }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-scissors" style={{ marginRight: 8, color: "#b8860b" }} />
              Custom Orders — Collect Balance
            </h3>
          </div>
          <div className="card-body" style={{ overflow: "visible" }}>
            {orderError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>{orderError}</div>
            )}
            {outstandingOrders.map((o) => {
              const outstanding = Math.max(0, o.balance - o.balanceCollected);
              return (
                <div
                  key={o.id}
                  style={{
                    marginBottom: 14,
                    padding: "14px 16px",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "rgba(201,168,76,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    {o.photo && (
                      <ZoomableImage src={photoUrl(o.photo)} alt={o.description} overlayCaption={o.description} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
                    )}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <strong>{o.description}</strong>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Cost ₹{formatInr(o.cost)} · Advance ₹{formatInr(o.advance)} · Collected ₹{formatInr(o.balanceCollected)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>OUTSTANDING</div>
                      <strong style={{ color: "var(--danger)", fontSize: 18 }}>₹{formatInr(outstanding)}</strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ minWidth: 140 }}>
                      <label className="form-label">Amount to collect (₹)</label>
                      <input
                        type="number"
                        className="form-control"
                        min={0}
                        max={outstanding}
                        value={orderForms[o.id] ?? String(outstanding)}
                        onChange={(e) => setOrderForms((prev) => ({ ...prev, [o.id]: e.target.value }))}
                      />
                    </div>
                    <PaymentModePicker
                      value={orderModes[o.id] || "cash"}
                      onChange={(v) => setOrderModes((prev) => ({ ...prev, [o.id]: v }))}
                      label="Payment Mode *"
                      name={`orderCollectMode-${o.id}`}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={orderBusy === o.id}
                      onClick={() => void collectOrder(o.id)}
                    >
                      <i className="fa-solid fa-indian-rupee-sign" style={{ marginRight: 6 }} />
                      {orderBusy === o.id ? "Collecting…" : "Collect Balance"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canMarkReturn && (
        <div className="card" style={{ overflow: "visible" }}>
          <div className="card-header"><h3 className="card-title">Mark Return</h3></div>
          <div className="card-body" style={{ overflow: "visible" }}>
            {returnError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>{returnError}</div>
            )}

            {isPartialDeliveryOut && (
              <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                Partial delivery: {deliveredItems.length} of {itemDelivery.length} dresses are out.
                You can return the delivered dress(es) now. Undelivered dresses stay on the booking.
              </div>
            )}

            {multiDress && (
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                {returnedItems.length > 0
                  ? `${returnedItems.length} of ${deliveredItems.length} dress${deliveredItems.length === 1 ? "" : "es"} returned — tick the dresses coming back now, then press Save.`
                  : `${deliveredItems.length} delivered dress${deliveredItems.length === 1 ? "" : "es"} on this booking — tick which ones are returned, then Save. One dress → single slip; two or more → combined slip for only those dresses.`}
              </p>
            )}

            {pendingReturnCount > 0 && (
              <div style={{ marginBottom: 20 }}>
                {multiDress && (
                  <h4 style={{ marginBottom: 12, fontSize: 14 }}>Select dresses to return</h4>
                )}
                {returnableItems.map((row) => {
                  const itemWarnings = findItemWarnings(warningItems, { itemId: row.itemId, dressName: row.dressName });
                  const selected = Boolean(selectedToReturn[row.id]);
                  return (
                  <div
                    key={row.id}
                    style={{
                      marginBottom: 10,
                      padding: "12px 14px",
                      border: `1px solid ${selected ? "#2e7d32" : "var(--border)"}`,
                      borderRadius: 10,
                      background: selected ? "rgba(46,125,50,0.06)" : "var(--cream-dark, #fafafa)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleReturnSelect(row.id, e.target.checked)}
                        style={{ width: 18, height: 18 }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>Return</span>
                    </label>
                    {row.photo && (
                      <img
                        src={photoUrl(row.photo)}
                        alt=""
                        style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <strong>{row.dressName}</strong>
                      {(row.category || row.size) && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {[row.category, row.size].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    </div>
                    {itemWarnings && <BookingItemWarningsBlock item={itemWarnings} />}
                  </div>
                  );
                })}
              </div>
            )}

            {returnedItems.length > 0 && (pendingReturnCount > 0 || undeliveredItems.length > 0) && (
              <div style={{ marginBottom: 16, fontSize: 13, color: "var(--success)" }}>
                <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                Already returned: {returnedItems.map((d) => d.dressName).join(", ")}
                {(partialReturn || undeliveredItems.length > 0) && returnedItems.length === 1 && (
                  <div style={{ marginTop: 10 }}>
                    <Link
                      href={returnSlipHref(booking.id, returnSlipSource, returnedItems[0].id)}
                      className="btn btn-outline btn-sm"
                      style={{ color: "#b8860b", borderColor: "#c9a84c" }}
                    >
                      <i className="fa-solid fa-receipt" style={{ marginRight: 6 }} />
                      Return Receipt — {returnedItems[0].dressName}
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || selectedReturnCount === 0}
              onClick={() => void saveSelectedReturns()}
            >
              <i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />
              {saving
                ? "Saving…"
                : selectedReturnCount === 0
                  ? "Select dresses to return"
                  : selectedReturnCount === 1
                    ? "Return Selected + Send Slip"
                    : `Return Selected (${selectedReturnCount}) + Combined Slip`}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={saving || selectedReturnCount === 0}
              onClick={() => void saveSelectedReturns({ openPrintSlip: true })}
              style={{ color: "#b8860b", borderColor: "#c9a84c" }}
            >
              <i className="fa-solid fa-print" style={{ marginRight: 6 }} />
              Return &amp; Print A4
            </button>
            {multiDress && pendingReturnCount > 1 && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={saving}
                onClick={() => selectAllReturnable(selectedReturnCount < pendingReturnCount)}
              >
                {selectedReturnCount < pendingReturnCount ? "Select all pending" : "Clear selection"}
              </button>
            )}
            <button
              className="btn btn-outline"
              disabled={saving || pendingReturnCount === 0}
              onClick={() => void act("mark_returned")}
              title={
                isPartialDeliveryOut
                  ? "Returns all delivered dresses only — undelivered dresses stay on the booking"
                  : undefined
              }
            >
              <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
              {isPartialDeliveryOut
                ? "Return All Delivered Dresses"
                : multiDress
                  ? "Mark All Remaining Returned"
                  : "Mark Returned (Complete)"}
            </button>
            </div>

            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
              <h4 style={{ marginBottom: 8 }}>
                <i className="fa-solid fa-circle-exclamation" style={{ color: "#f39c12", marginRight: 8 }} />
                Incomplete Return
              </h4>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                Check each dress that is missing or damaged, then add notes, security held, and a photo below.
                {returnableItems.length === 1 ? " This dress is pre-selected." : ""}
              </p>

              {incompleteError && (
                <div className="alert alert-error" style={{ marginBottom: 16 }}>{incompleteError}</div>
              )}
              {photoProgress && (
                <div className="alert" style={{ marginBottom: 16 }}>{photoProgress}</div>
              )}

              {returnableItems.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No delivered dresses pending return.</p>
              ) : (
                returnableItems.map((row) => {
                  const form = incompleteForms[row.id];
                  const selected = form?.selected ?? false;
                  return (
                    <div
                      key={row.id}
                      style={{
                        marginBottom: 14,
                        padding: "14px 16px",
                        border: `1.5px solid ${selected ? "#f39c12" : "var(--border)"}`,
                        borderRadius: 10,
                        background: selected ? "rgba(243,156,18,0.06)" : "var(--cream-dark, #fafafa)",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => toggleIncompleteDress(row.id, e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: "#f39c12" }}
                        />
                        {row.photo && (
                          <img
                            src={photoUrl(row.photo)}
                            alt=""
                            style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <strong>{row.dressName}</strong>
                          {(row.category || row.size) && (
                            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {[row.category, row.size].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <span className="badge badge-warning">Mark incomplete</span>
                      </label>

                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed rgba(243,156,18,0.4)" }}>
              <div style={{ marginBottom: 12 }}>
                          <label className="form-label">What is missing / notes for this dress</label>
                          <textarea
                            className="form-control"
                            rows={2}
                            value={form?.notes ?? ""}
                            onChange={(e) => updateIncompleteForm(row.id, { notes: e.target.value })}
                            placeholder="e.g. Dupatta missing, dress damaged…"
                            disabled={!selected}
                          />
              </div>
              <div style={{ marginBottom: 12 }}>
                          <label className="form-label">Security to hold for this dress (₹)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={form?.securityHeld ?? ""}
                            onChange={(e) => updateIncompleteForm(row.id, { securityHeld: e.target.value })}
                            min={0}
                            step="0.01"
                            disabled={!selected}
                          />
              </div>
                        <div>
                          <label className="form-label">
                            Photo <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
                          </label>
                          {selected ? (
                            <PhotoCaptureButton
                              label={`Incomplete photo — ${row.dressName}`}
                              modalTitle={`Capture photo — ${row.dressName}`}
                              previewUrl={form?.photoPreview}
                              onCapture={(file) => onIncompletePhotoChange(row.id, file)}
                              emptyHeight={100}
                            />
                          ) : (
                            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                              Check the dress above to enable photo capture.
                            </p>
                )}
              </div>
                      </div>
                    </div>
                  );
                })
              )}

              <button
                type="button"
                className="btn btn-outline"
                style={{ marginTop: 8, borderColor: "#f39c12", color: "#e67e22" }}
                disabled={saving || (returnableItems.length > 0 && !anyIncompleteSelected)}
                onClick={() => void submitIncompleteReturn()}
              >
                <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />
                {saving ? "Saving…" : "Mark Incomplete Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {booking.status === "returned" && (
        <div className="card" style={{ borderLeft: "4px solid var(--success)" }}>
          <div className="card-body">
            <h3 style={{ color: "var(--success)", marginBottom: 8 }}>
              <i className="fa-solid fa-circle-check" /> Return Complete
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>This booking has been fully returned.</p>
          </div>
        </div>
      )}

      {booking.status === "incomplete_return" && (
        <div className="card" style={{ borderLeft: "4px solid #f39c12" }}>
          <div className="card-body">
            <h3 style={{ color: "#f39c12", marginBottom: 12 }}>
              <i className="fa-solid fa-circle-exclamation" /> Incomplete Return
            </h3>

            <IncompleteSecuritySummaryBox summary={incompleteSecurity} />

            {itemDelivery.filter((d) => d.isIncompleteReturn).length > 0 ? (
              itemDelivery
                .filter((d) => d.isIncompleteReturn)
                .map((d, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 14,
                      padding: "12px 14px",
                      border: "1px solid rgba(243,156,18,0.35)",
                      borderRadius: 8,
                      background: "rgba(243,156,18,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      {d.photo && (
                        <img src={photoUrl(d.photo)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                      )}
                      <strong>{d.dressName}</strong>
                      <span className="badge badge-incomplete_return" style={{ marginLeft: "auto" }}>Incomplete</span>
                    </div>
                    <p style={{ margin: "4px 0", fontSize: 13 }}>
                      <strong>Notes:</strong> {d.itemIncompleteNotes || booking.incompleteNotes || "—"}
                    </p>
                    {(d.itemSecurityCollected ?? 0) > 0 && (
                      <p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-muted)" }}>
                        Security collected at delivery: ₹{formatInr(d.itemSecurityCollected || 0)}
                        {securityPaymentLabel ? ` · ${securityPaymentLabel}` : ""}
                      </p>
                    )}
                    {(d.itemSecurityHeld ?? 0) > 0 && (
                      <p style={{ margin: "4px 0", fontSize: 13 }}>
                        <strong>Security held:</strong> ₹{formatInr(d.itemSecurityHeld || 0)}
                      </p>
                    )}
                    {d.itemIncompletePhoto && (
                      <a href={photoUrl(d.itemIncompletePhoto)} target="_blank" rel="noreferrer">
                        <img
                          src={photoUrl(d.itemIncompletePhoto)}
                          alt="Incomplete"
                          style={{ marginTop: 8, maxWidth: 200, maxHeight: 200, borderRadius: 8, border: "1px solid var(--border)" }}
                        />
                      </a>
                    )}
                    {d.id > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={saving}
                          onClick={() => void act("mark_item_returned", d.id)}
                        >
                          <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                          Mark This Dress Returned
                        </button>
                      </div>
                    )}
                  </div>
                ))
            ) : (
              <>
            <p><strong>Missing Items:</strong> {booking.incompleteNotes || "—"}</p>
            {booking.incompletePhoto && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>Photo</p>
                <a href={photoUrl(booking.incompletePhoto)} target="_blank" rel="noreferrer">
                  <img
                    src={photoUrl(booking.incompletePhoto)}
                    alt="Incomplete item"
                    style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </a>
              </div>
            )}
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={saving}
                    onClick={async () => {
                      if (!confirm("Mark this incomplete return as fully resolved?")) return;
                      setSaving(true);
                      try {
                        const res = await fetch(`/api/return/${booking.id}/save`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "resolve_incomplete_return" }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          alert(typeof data.error === "string" ? data.error : "Could not resolve");
                          return;
                        }
                        router.refresh();
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                    Mark Returned (Resolve)
                  </button>
                </div>
              </>
            )}
            {itemDelivery.some((d) => d.isReturned && d.isDelivered) && (
              <p style={{ fontSize: 13, color: "var(--success)", marginTop: 12 }}>
                <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                Other dress(es) in this booking were returned completely.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              <Link href={`/booking/${booking.id}/incomplete-slip`} className="btn btn-outline" style={{ color: "#c2410c", borderColor: "#f39c12" }}>
                <i className="fa-solid fa-receipt" style={{ marginRight: 6 }} />Print Incomplete Slip
              </Link>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={async () => {
                  if (!confirm("Mark this incomplete return as fully resolved and close the booking?")) return;
                  setSaving(true);
                  try {
                    const res = await fetch(`/api/return/${booking.id}/save`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "resolve_incomplete_return" }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      alert(typeof data.error === "string" ? data.error : "Could not resolve incomplete return");
                      return;
                    }
                    router.refresh();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                Mark All Returned (Resolve)
              </button>
              <Link href="/incomplete-return" className="btn btn-outline">
              View in Incomplete Returns
            </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
