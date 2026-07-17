"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookingRecordDetails } from "@/components/BookingRecordDetails";
import BookingItemWarningsBlock, {
  BookingItemWarningsSection,
  findItemWarnings,
} from "@/components/BookingItemWarningsSection";
import PhotoCaptureButton from "@/components/PhotoCaptureButton";
import PaymentModePicker, { type PaymentMode } from "@/components/PaymentModePicker";
import type { BookingForStandardDetails } from "@/lib/bookingDetails";
import { WARNING_BOOKED_ON_RETURN, WARNING_RETURNING_ON_DELIVERY } from "@/lib/bookingDetails";
import type { ItemWarningSource } from "@/lib/bookingWarningPdf";
import { formatInr } from "@/lib/format";
import { idProofUrl, photoUrl } from "@/lib/photoUrl";
import ZoomableImage from "@/components/ZoomableImage";
import { deliverySlipHref, hasPartialDelivery } from "@/lib/bookingStatus";
import { navigatePrintTab, openBlankPrintTab, withSlipPrintQuery } from "@/lib/slipPrintUrl";
import { generateUuidV4 } from "@/lib/clientUuid";
import { useToast } from "@/components/ui/Toast";

type ItemRow = {
  id: number;
  itemId?: number | null;
  dressName: string;
  category?: string | null;
  size?: string | null;
  price: number;
  remaining: number;
  advance?: number;
  photo?: string;
  isDelivered: boolean;
  isCancelled?: boolean;
  cancelRefundAmount?: number;
  itemRemainingCollected: number;
  itemSecurityCollected: number;
  itemDeliveryNotes?: string | null;
  preparedBy?: string;
  checkedBy?: string;
  packingNote?: string;
};

type BookingData = BookingForStandardDetails & {
  id: number;
  monthlySerial: number;
  status: string;
  remainingCollected: number;
  securityCollected: number;
  deliveryNotes?: string | null;
  totalPrice?: number;
  price?: number;
  totalAdvance?: number;
  advance?: number;
  totalRemaining?: number;
  remaining?: number;
  remainingPaymentMode?: string | null;
  securityPaymentMode?: string | null;
};

type OrderRow = {
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

type JewelleryRow = {
  id: number;
  name: string;
  category?: string | null;
  photo?: string | null;
  source: string;
  note?: string | null;
  partsLabel?: string;
};

type ItemFormState = {
  remaining: string;
  security: string;
  notes: string;
};

type SaveItemResponse = {
  id: number;
  isDelivered: boolean;
  itemRemainingCollected: number;
  itemSecurityCollected: number;
  itemDeliveryNotes?: string | null;
};

export default function DeliveryDetailClient({
  booking,
  items: initialItems,
  warningItems = [],
  nextBookings,
  isDelivered = false,
  idPhoto1 = null,
  idPhoto2 = null,
  orders = [],
  jewellery = [],
}: {
  booking: BookingData;
  items: ItemRow[];
  warningItems?: ItemWarningSource[];
  nextBookings: Array<{ dress: string; next_customer: string; next_serial: number; next_time: string; next_venue: string }>;
  isDelivered?: boolean;
  idPhoto1?: string | null;
  idPhoto2?: string | null;
  orders?: OrderRow[];
  jewellery?: JewelleryRow[];
}) {
  const [localItems, setLocalItems] = useState(initialItems);
  const [bookingStatus, setBookingStatus] = useState(booking.status);
  const [itemForms, setItemForms] = useState<Record<number, ItemFormState>>(() => {
    const init: Record<number, ItemFormState> = {};
    for (const it of initialItems) {
      init[it.id] = {
        remaining: String(it.itemRemainingCollected || ""),
        security: String(it.itemSecurityCollected || ""),
        notes: it.itemDeliveryNotes || "",
      };
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const toast = useToast();
  const [error, setError] = useState("");
  const [editingDelivered, setEditingDelivered] = useState<Record<number, boolean>>({});
  const [idPhoto1File, setIdPhoto1File] = useState<File | null>(null);
  const [idPhoto2File, setIdPhoto2File] = useState<File | null>(null);
  const [idPhoto1Preview, setIdPhoto1Preview] = useState<string | null>(null);
  const [idPhoto2Preview, setIdPhoto2Preview] = useState<string | null>(null);
  const [savedIdPhoto1, setSavedIdPhoto1] = useState(idPhoto1);
  const [savedIdPhoto2, setSavedIdPhoto2] = useState(idPhoto2);
  const [savingIdPhotos, setSavingIdPhotos] = useState(false);
  const [idPhotoMessage, setIdPhotoMessage] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    booking.remainingPaymentMode === "online" ? "online" : "cash",
  );
  const [securityPaymentMode, setSecurityPaymentMode] = useState<PaymentMode>(
    booking.securityPaymentMode === "online" ? "online" : "cash",
  );
  const [localOrders, setLocalOrders] = useState<OrderRow[]>(orders);
  const [orderForms, setOrderForms] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const o of orders) init[o.id] = String(Math.max(0, o.balance - o.balanceCollected) || "");
    return init;
  });
  const [orderBusy, setOrderBusy] = useState<number | null>(null);
  const [selectedToDeliver, setSelectedToDeliver] = useState<Record<number, boolean>>(() => {
    const pending = initialItems.filter((it) => !it.isDelivered && !it.isCancelled);
    const init: Record<number, boolean> = {};
    for (const it of pending) init[it.id] = pending.length === 1;
    return init;
  });
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    setLocalItems(initialItems);
    setBookingStatus(booking.status);
    setSelectedToDeliver((prev) => {
      const pending = initialItems.filter((it) => !it.isDelivered && !it.isCancelled);
      const next: Record<number, boolean> = {};
      for (const it of pending) {
        next[it.id] = prev[it.id] ?? pending.length === 1;
      }
      return next;
    });
  }, [initialItems, booking.status]);

  useEffect(() => {
    setLocalOrders(orders);
  }, [orders]);

  useEffect(() => {
    setSavedIdPhoto1(idPhoto1);
    setSavedIdPhoto2(idPhoto2);
  }, [idPhoto1, idPhoto2]);

  const allDelivered =
    localItems.filter((it) => !it.isCancelled).length > 0
      ? localItems.filter((it) => !it.isCancelled).every((it) => it.isDelivered)
      : bookingStatus === "delivered";
  const partialDelivery = hasPartialDelivery({
    status: bookingStatus,
    bookingItems: localItems.map((it) => ({
      id: it.id,
      isDelivered: it.isDelivered,
      isCancelled: it.isCancelled,
    })),
  });
  const pendingItems = localItems.filter((it) => !it.isDelivered && !it.isCancelled);
  const selectedPendingIds = pendingItems.filter((it) => selectedToDeliver[it.id]).map((it) => it.id);
  const selectedPendingCount = selectedPendingIds.length;
  const cancelledItems = localItems.filter((it) => it.isCancelled);

  function toggleDeliverSelect(id: number, selected: boolean) {
    setSelectedToDeliver((prev) => ({ ...prev, [id]: selected }));
  }

  function selectAllPending(selected: boolean) {
    setSelectedToDeliver((prev) => {
      const next = { ...prev };
      for (const it of pendingItems) next[it.id] = selected;
      return next;
    });
  }

  async function cancelDress(itemId: number, refundAdvance: boolean) {
    setCancelBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/booking/${booking.id}/items/${itemId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund_advance: refundAdvance }),
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Cancel failed");
        return;
      }
      setCancellingId(null);
      if (data.status) setBookingStatus(data.status);
      if (Array.isArray(data.items)) {
        setLocalItems((prev) =>
          prev.map((it) => {
            const row = data.items.find((s: { id: number }) => s.id === it.id);
            if (!row) return it;
            return {
              ...it,
              isCancelled: row.isCancelled,
              cancelRefundAmount: row.cancelRefundAmount,
              isDelivered: row.isDelivered,
              advance: row.advance,
              remaining: row.remaining,
              price: row.price,
            };
          }),
        );
      } else {
        setLocalItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  isCancelled: true,
                  cancelRefundAmount: refundAdvance ? it.advance || 0 : 0,
                }
              : it,
          ),
        );
      }
      toast(
        refundAdvance
          ? "Dress cancelled — advance refunded (subtracted from finance)"
          : "Dress cancelled — advance kept (not subtracted)",
        "success",
      );
    } finally {
      setCancelBusy(false);
    }
  }

  function applySaveResponse(data: { status?: string; items?: SaveItemResponse[] }) {
    if (data.status) setBookingStatus(data.status);
    if (!data.items?.length) return;
    const byId = new Map(data.items.map((it) => [it.id, it]));
    setLocalItems((prev) =>
      prev.map((it) => {
        const saved = byId.get(it.id);
        if (!saved) return it;
        return {
          ...it,
          isDelivered: saved.isDelivered,
          itemRemainingCollected: saved.itemRemainingCollected,
          itemSecurityCollected: saved.itemSecurityCollected,
          itemDeliveryNotes: saved.itemDeliveryNotes,
        };
      }),
    );
    setEditingDelivered((prev) => {
      const next = { ...prev };
      for (const saved of data.items!) {
        if (saved.isDelivered) delete next[saved.id];
      }
      return next;
    });
  }

  function updateItem(id: number, field: keyof ItemFormState, value: string) {
    setItemForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveItem(itemId: number, opts?: { openPrintSlip?: boolean }) {
    if (submittingRef.current || saving) return;
    submittingRef.current = true;
    setSaving(true);
    setError("");
    const printWindow = opts?.openPrintSlip ? openBlankPrintTab() : null;
    const it = localItems.find((i) => i.id === itemId);
    if (!it) {
      printWindow?.close();
      setSaving(false);
      submittingRef.current = false;
      return;
    }

    if (!(await flushPendingIdPhotos())) {
      printWindow?.close();
      setSaving(false);
      submittingRef.current = false;
      setError("Could not save ID photos. Try Save ID Photos, then deliver again.");
      return;
    }

    const payload = {
      operation_id: generateUuidV4(),
      payment_mode: paymentMode,
      security_payment_mode: securityPaymentMode,
      items: [{
        booking_item_id: itemId,
        remaining_collected: Number(itemForms[itemId]?.remaining) || 0,
        security_collected: Number(itemForms[itemId]?.security) || 0,
        delivery_notes: itemForms[itemId]?.notes || "",
        mark_delivered: !it.isDelivered,
        update_only: it.isDelivered && editingDelivered[itemId],
      }],
    };

    try {
    const res = await fetch(`/api/booking-delivery/${booking.id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      printWindow?.close();
      setError(data.error || "Save failed");
      return;
    }
    applySaveResponse(data);
    if (data.slip_queued) toast("Delivery saved — receipt queued for WhatsApp", "success");
    if (opts?.openPrintSlip) {
      const updatedItems = localItems.map((row) => {
        const saved = data.items?.find((s: SaveItemResponse) => s.id === row.id);
        if (!saved) return row;
        return { ...row, isDelivered: saved.isDelivered };
      });
      const merged = updatedItems.map((row) =>
        row.id === itemId ? { ...row, isDelivered: true } : row,
      );
      navigatePrintTab(
        printWindow,
        deliverySlipHref(
          booking.id,
          { status: data.status ?? booking.status, bookingItems: merged },
          itemId,
        ),
      );
    }
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  /** Save selected dresses as delivered and send slip for only those dresses (1 = single, 2+ = combined). */
  async function saveSelected(opts?: { openPrintSlip?: boolean }) {
    const ids = selectedPendingIds;
    if (!ids.length) {
      setError("Select at least one dress to deliver, then press Save.");
      return;
    }
    if (submittingRef.current || saving) return;
    submittingRef.current = true;
    setSaving(true);
    setError("");
    const printWindow = opts?.openPrintSlip ? openBlankPrintTab() : null;

    if (!(await flushPendingIdPhotos())) {
      printWindow?.close();
      setSaving(false);
      submittingRef.current = false;
      setError("Could not save ID photos. Try Save ID Photos, then deliver again.");
      return;
    }

    const payload = {
      operation_id: generateUuidV4(),
      slip_finalize: true,
      payment_mode: paymentMode,
      security_payment_mode: securityPaymentMode,
      items: ids.map((id) => ({
        booking_item_id: id,
        remaining_collected: Number(itemForms[id]?.remaining) || 0,
        security_collected: Number(itemForms[id]?.security) || 0,
        delivery_notes: itemForms[id]?.notes || "",
        mark_delivered: true,
      })),
    };

    try {
    const res = await fetch(`/api/booking-delivery/${booking.id}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      printWindow?.close();
      setError(data.error || "Save failed");
      return;
    }
    applySaveResponse(data);
    if (data.slip_queued) toast("Delivery saved — receipt queued for WhatsApp", "success");
    setSelectedToDeliver((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    if (opts?.openPrintSlip) {
      const merged = localItems.map((row) => {
        const saved = data.items?.find((s: SaveItemResponse) => s.id === row.id);
        if (saved) return { ...row, isDelivered: saved.isDelivered };
        if (ids.includes(row.id)) return { ...row, isDelivered: true };
        return row;
      });
      navigatePrintTab(
        printWindow,
        deliverySlipHref(
          booking.id,
          { status: data.status ?? booking.status, bookingItems: merged },
          ids.length === 1 ? ids[0] : undefined,
          ids,
        ),
      );
    }
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  /** Save remaining/security/notes for selected dresses without marking delivered or sending a slip. */
  async function saveDetailsOnlySelected() {
    const ids = selectedPendingIds;
    if (!ids.length) {
      setError("Select at least one dress to save payment details.");
      return;
    }
    if (submittingRef.current || saving) return;
    submittingRef.current = true;
    setSaving(true);
    setError("");
    const payload = {
      operation_id: generateUuidV4(),
      payment_mode: paymentMode,
      security_payment_mode: securityPaymentMode,
      items: ids.map((id) => ({
        booking_item_id: id,
        remaining_collected: Number(itemForms[id]?.remaining) || 0,
        security_collected: Number(itemForms[id]?.security) || 0,
        delivery_notes: itemForms[id]?.notes || "",
        mark_delivered: false,
      })),
    };
    try {
      const res = await fetch(`/api/booking-delivery/${booking.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      applySaveResponse(data);
      toast("Payment details saved (not delivered yet)", "success");
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  async function saveIdPhotos(files?: { slot1?: File | null; slot2?: File | null }): Promise<boolean> {
    // Ignore accidental click Event if someone wires onClick={saveIdPhotos}.
    const isEventLike =
      !!files &&
      typeof files === "object" &&
      (typeof Event !== "undefined" && files instanceof Event || "nativeEvent" in files);
    const payload = isEventLike ? undefined : files;
    const f1 = payload && "slot1" in payload ? payload.slot1 ?? null : idPhoto1File;
    const f2 = payload && "slot2" in payload ? payload.slot2 ?? null : idPhoto2File;
    if (!f1 && !f2) {
      setIdPhotoMessage("Choose at least one photo to upload.");
      return false;
    }
    setSavingIdPhotos(true);
    setIdPhotoMessage("");
    try {
      const form = new FormData();
      if (f1) form.append("id_photo_1", f1);
      if (f2) form.append("id_photo_2", f2);
      const res = await fetch(`/api/booking-delivery/${booking.id}/id-photos`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setIdPhotoMessage(data.error || "Failed to save ID photos");
        return false;
      }
      if (data.id_photo_1) setSavedIdPhoto1(data.id_photo_1);
      if (data.id_photo_2) setSavedIdPhoto2(data.id_photo_2);
      setIdPhoto1File(null);
      setIdPhoto2File(null);
      if (idPhoto1Preview) URL.revokeObjectURL(idPhoto1Preview);
      if (idPhoto2Preview) URL.revokeObjectURL(idPhoto2Preview);
      setIdPhoto1Preview(null);
      setIdPhoto2Preview(null);
      setIdPhotoMessage("ID photos saved — they will show on the return page.");
      return true;
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message: unknown }).message)
            : "Failed to save ID photos";
      setIdPhotoMessage(msg);
      return false;
    } finally {
      setSavingIdPhotos(false);
    }
  }

  /** Persist any unsaved ID captures before marking delivered. */
  async function flushPendingIdPhotos(): Promise<boolean> {
    if (!idPhoto1File && !idPhoto2File) return true;
    return saveIdPhotos();
  }

  function onIdPhotoChange(slot: 1 | 2, file: File | null) {
    if (slot === 1) {
      setIdPhoto1File(file);
      if (idPhoto1Preview) URL.revokeObjectURL(idPhoto1Preview);
      setIdPhoto1Preview(file ? URL.createObjectURL(file) : null);
    } else {
      setIdPhoto2File(file);
      if (idPhoto2Preview) URL.revokeObjectURL(idPhoto2Preview);
      setIdPhoto2Preview(file ? URL.createObjectURL(file) : null);
    }
    setIdPhotoMessage("");
    if (file) {
      // Auto-upload so deliver / return see the photo without a separate Save click.
      void saveIdPhotos(
        slot === 1
          ? { slot1: file, slot2: idPhoto2File }
          : { slot1: idPhoto1File, slot2: file },
      );
    }
  }

  async function collectOrder(orderId: number) {
    const o = localOrders.find((x) => x.id === orderId);
    if (!o) return;
    const amount = Number(orderForms[orderId]) || 0;
    setOrderBusy(orderId);
    setError("");
    try {
      const res = await fetch(`/api/booking/${booking.id}/orders/${orderId}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance_collected: amount, payment_mode: paymentMode }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to collect order balance");
        return;
      }
      const newCollected = data.order?.balanceCollected ?? o.balanceCollected + amount;
      setLocalOrders((prev) => prev.map((x) => (x.id === orderId ? { ...x, balanceCollected: newCollected } : x)));
      setOrderForms((prev) => ({ ...prev, [orderId]: String(Math.max(0, o.balance - newCollected) || "") }));
    } finally {
      setOrderBusy(null);
    }
  }

  const orderDisplay = localOrders.map((o) => ({
    description: o.description,
    cost: o.cost,
    advance: o.advance,
    balance: Math.max(0, o.balance - o.balanceCollected),
    photo: o.photo,
    deliveryDate: o.deliveryDate,
    deliveryTime: o.deliveryTime,
    includedInRent: o.includedInRent,
  }));

  const dressTotal = booking.totalPrice ?? booking.price ?? 0;
  const dressAdvance = booking.totalAdvance ?? booking.advance ?? 0;
  const ordersCostSum = localOrders.reduce((s, o) => s + (o.cost || 0), 0);
  const ordersAdvanceSum = localOrders.reduce((s, o) => s + (o.advance || 0), 0);
  const ordersCollectedSum = localOrders.reduce((s, o) => s + (o.balanceCollected || 0), 0);
  const dressRemainingCollected =
    localItems.length > 0
      ? localItems.reduce((s, it) => s + (it.itemRemainingCollected || 0), 0)
      : booking.remainingCollected || 0;
  const grandTotal = dressTotal + ordersCostSum;
  const grandAdvance = dressAdvance + ordersAdvanceSum;
  const balanceReceived = dressRemainingCollected + ordersCollectedSum;
  const remainingBalance = Math.max(0, grandTotal - grandAdvance - balanceReceived);

  return (
    <div>
      {allDelivered && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }} className="no-print">
          <Link
            href={`/booking/${booking.id}/delivery-slip`}
            className="btn btn-primary"
            style={{ background: "#1565c0", border: "none" }}
          >
            <i className="fa-solid fa-truck-fast" style={{ marginRight: 6 }} />
            View Delivery Slip
          </Link>
          <Link
            href={withSlipPrintQuery(`/booking/${booking.id}/delivery-slip`)}
            className="btn btn-outline"
            style={{ color: "#1565c0", borderColor: "#1565c0" }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="fa-solid fa-print" style={{ marginRight: 6 }} />
            Print A4 Slip
          </Link>
          <Link
            href={`/booking/${booking.id}/customer-slips`}
            className="btn btn-outline"
            style={{ color: "#5b21b6", borderColor: "#7c3aed" }}
            title="View booking, delivery and return slips sent to the customer"
          >
            <i className="fa-solid fa-file-pdf" style={{ marginRight: 6 }} />
            All Customer Slips
          </Link>
        </div>
      )}
      {allDelivered && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-circle-check" style={{ marginRight: 8 }} />
          All dresses delivered. Scroll down to edit booking details if needed.
        </div>
      )}
      {!allDelivered && isDelivered && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 8 }} />
          Partial delivery: select the remaining dresses below, enter payments, then press{" "}
          <strong>Deliver Selected</strong> once — one combined slip is sent for that selection.
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Booking Details</h3>
          <span className={`badge badge-${allDelivered ? "success" : "warning"}`}>
            {allDelivered ? "ALL DELIVERED" : booking.status.toUpperCase()}
          </span>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: 12, fontSize: 14 }}>
            <strong>Serial:</strong> #{String(booking.monthlySerial).padStart(2, "0")}
          </p>
          <BookingRecordDetails booking={booking} orders={orderDisplay} />
          {warningItems.length <= 1 && <BookingItemWarningsSection items={warningItems} />}
        </div>
      </div>

      {nextBookings.length > 0 && !warningItems.some((w) => w.returning_warning || w.booked_warning) && (
        <div className="card" style={{ marginBottom: 20, borderLeft: "4px solid #f39c12" }}>
          <div className="card-header"><h3 className="card-title" style={{ color: "#f39c12" }}>Warning: Next booking on return date</h3></div>
          <div className="card-body">
            {nextBookings.map((nb, i) => (
              <p key={i}><strong>{nb.dress}</strong> → {nb.next_customer} (#{String(nb.next_serial).padStart(2, "0")}) at {nb.next_time}</p>
            ))}
          </div>
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-id-card" style={{ marginRight: 8 }} />
            Customer ID Photos
            <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>(optional)</span>
          </h3>
        </div>
        <div className="card-body">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-muted)" }}>
            Capture up to two ID photos at delivery. Photos upload automatically and also save when you
            deliver. They appear on the return page and are removed only when the booking is fully returned.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {([1, 2] as const).map((slot) => {
              const preview = slot === 1 ? idPhoto1Preview : idPhoto2Preview;
              const saved = slot === 1 ? savedIdPhoto1 : savedIdPhoto2;
              return (
                <div key={slot}>
                  <label className="form-label">ID Photo {slot}</label>
                  <PhotoCaptureButton
                    label={`ID photo ${slot}`}
                    modalTitle={`Capture ID Photo ${slot}`}
                    previewUrl={preview}
                    savedUrl={saved ? idProofUrl(saved) : null}
                    onCapture={(file) => onIdPhotoChange(slot, file)}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={savingIdPhotos || (!idPhoto1File && !idPhoto2File)}
              onClick={() => void saveIdPhotos()}
            >
              {savingIdPhotos ? "Saving…" : "Save ID Photos"}
            </button>
            {idPhotoMessage && (
              <span style={{ fontSize: 13, color: idPhotoMessage.includes("saved") ? "var(--success)" : "var(--text-muted)" }}>
                {idPhotoMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            <i className="fa-solid fa-shirt" style={{ marginRight: 8 }} />
            Booked Dresses
            {pendingItems.length > 0 && (
              <span style={{ fontWeight: 500, fontSize: 13, color: "var(--text-muted)", marginLeft: 10 }}>
                {selectedPendingCount} of {pendingItems.length} selected to deliver
              </span>
            )}
          </h3>
          {!allDelivered && pendingItems.length > 1 && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={saving}
              onClick={() => selectAllPending(selectedPendingCount < pendingItems.length)}
            >
              {selectedPendingCount < pendingItems.length ? "Select all" : "Clear selection"}
            </button>
          )}
        </div>
        <div className="card-body">
          {!allDelivered && (
            <div style={{ marginBottom: 16, padding: 16, background: "var(--cream-dark)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 16 }}>
              <PaymentModePicker
                value={paymentMode}
                onChange={setPaymentMode}
                label="Balance Payment Mode *"
                name="deliveryPaymentMode"
              />
              <PaymentModePicker
                value={securityPaymentMode}
                onChange={setSecurityPaymentMode}
                label="Security Deposit Payment Mode *"
                name="deliverySecurityPaymentMode"
              />
            </div>
          )}
          {!allDelivered && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
              Tick each dress you are handing over now. Enter remaining and security for each dress,
              then press <strong>Deliver Selected</strong> at the bottom once.
              {pendingItems.length > 1
                ? " Two or more selected dresses send one combined delivery slip (WhatsApp + print)."
                : " One dress sends a single delivery slip."}
            </p>
          )}
          {localItems.map((it) => (
            <div
              key={it.id}
              style={{
                border: `1.5px solid ${
                  it.isCancelled
                    ? "rgba(192,57,43,0.45)"
                    : it.isDelivered
                      ? "var(--success)"
                      : selectedToDeliver[it.id]
                        ? "#1565c0"
                        : "var(--border)"
                }`,
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                background: it.isCancelled
                  ? "rgba(192,57,43,0.05)"
                  : it.isDelivered
                    ? "rgba(46,125,50,0.04)"
                    : selectedToDeliver[it.id]
                      ? "rgba(21,101,192,0.04)"
                      : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                {!it.isDelivered && !it.isCancelled && (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selectedToDeliver[it.id])}
                      onChange={(e) => toggleDeliverSelect(it.id, e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>
                      Select
                    </span>
                  </label>
                )}
                {it.photo && (
                  <img src={photoUrl(it.photo)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", opacity: it.isCancelled ? 0.55 : 1 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{it.dressName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {it.category}{it.size ? ` · ${it.size}` : ""} · Rent ₹{formatInr(it.price)}
                    {!it.isCancelled && <> · Remaining ₹{formatInr(it.remaining)}</>}
                    {typeof it.advance === "number" && it.advance > 0 && <> · Advance ₹{formatInr(it.advance)}</>}
                  </div>
                </div>
                {it.isCancelled ? (
                  <span className="badge" style={{ background: "rgba(192,57,43,0.12)", color: "var(--danger)" }}>
                    Cancelled{(it.cancelRefundAmount || 0) > 0 ? " · Refunded" : " · Not refunded"}
                  </span>
                ) : it.isDelivered ? (
                  <span className="badge badge-success"><i className="fa-solid fa-check" /> Delivered</span>
                ) : (
                  <span className="badge badge-warning">Pending</span>
                )}
              </div>

              {it.isCancelled ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                  This dress was cancelled
                  {(it.cancelRefundAmount || 0) > 0
                    ? ` and advance ₹${formatInr(it.cancelRefundAmount || it.advance || 0)} was refunded (subtracted from finance).`
                    : " — advance was not refunded (kept in finance)."}
                </p>
              ) : (
                <>
              {(it.preparedBy || it.checkedBy || it.packingNote) && (
                <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--info-bg, #e8f4fd)", borderRadius: 8, fontSize: 12 }}>
                  <strong style={{ fontSize: 11, color: "var(--text-muted)" }}>PACKING INFO</strong>
                  {it.preparedBy && <div>Prepared by: {it.preparedBy}</div>}
                  {it.checkedBy && <div>Checked by: {it.checkedBy}</div>}
                  {it.packingNote && <div>Note: {it.packingNote}</div>}
                </div>
              )}

              {warningItems.length > 1 && (() => {
                const itemWarnings = findItemWarnings(warningItems, { itemId: it.itemId, dressName: it.dressName });
                return itemWarnings ? <BookingItemWarningsBlock item={itemWarnings} /> : null;
              })()}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="form-label">Remaining Collected (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={itemForms[it.id]?.remaining ?? ""}
                    onChange={(e) => updateItem(it.id, "remaining", e.target.value)}
                    disabled={it.isDelivered && !editingDelivered[it.id]}
                  />
                </div>
                <div>
                  <label className="form-label">Security Collected (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={itemForms[it.id]?.security ?? ""}
                    onChange={(e) => updateItem(it.id, "security", e.target.value)}
                    disabled={it.isDelivered && !editingDelivered[it.id]}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label">Delivery Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={itemForms[it.id]?.notes ?? ""}
                  onChange={(e) => updateItem(it.id, "notes", e.target.value)}
                  disabled={it.isDelivered && !editingDelivered[it.id]}
                  placeholder="Notes for this dress…"
                />
              </div>
              {!it.isDelivered && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={saving || cancelBusy}
                    onClick={() => setCancellingId(cancellingId === it.id ? null : it.id)}
                    style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
                  >
                    <i className="fa-solid fa-ban" style={{ marginRight: 6 }} />
                    Cancel
                  </button>
                </div>
              )}
              {cancellingId === it.id && !it.isDelivered && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 10,
                    border: "1.5px solid rgba(192,57,43,0.35)",
                    background: "rgba(192,57,43,0.05)",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--danger)" }}>
                    Cancel {it.dressName}?
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-muted)" }}>
                    Advance on this dress: ₹{formatInr(it.advance || 0)}. Choose whether that advance was refunded to the customer.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={cancelBusy}
                      onClick={() => void cancelDress(it.id, true)}
                    >
                      Refunded
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={cancelBusy}
                      onClick={() => void cancelDress(it.id, false)}
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
              {it.isDelivered && !editingDelivered[it.id] && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditingDelivered((prev) => ({ ...prev, [it.id]: true }))}
                  >
                    <i className="fa-solid fa-pen" style={{ marginRight: 6 }} />
                    Edit payment record
                  </button>
                  {partialDelivery && (
                    <Link
                      href={deliverySlipHref(booking.id, {
                        status: booking.status,
                        bookingItems: localItems.map((row) => ({
                          id: row.id,
                          isDelivered: row.isDelivered,
                          isCancelled: row.isCancelled,
                        })),
                      }, it.id)}
                      className="btn btn-outline btn-sm"
                      style={{ color: "#1565c0", borderColor: "#1565c0" }}
                    >
                      <i className="fa-solid fa-file-lines" style={{ marginRight: 6 }} />
                      View slip
                    </Link>
                  )}
                </div>
              )}
              {it.isDelivered && editingDelivered[it.id] && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={saving}
                    onClick={() => void saveItem(it.id)}
                  >
                    <i className="fa-solid fa-save" style={{ marginRight: 6 }} />
                    Save Changes
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setEditingDelivered((prev) => ({ ...prev, [it.id]: false }))}
                  >
                    Cancel
                  </button>
                </div>
              )}
                </>
              )}
            </div>
          ))}

          {cancelledItems.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {cancelledItems.length} cancelled dress{cancelledItems.length === 1 ? "" : "es"} listed above — they will not be delivered.
            </p>
          )}

          {!allDelivered && pendingItems.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 16,
                flexWrap: "wrap",
                alignItems: "center",
                padding: 16,
                borderRadius: 12,
                border: "1.5px solid #1565c0",
                background: "rgba(21,101,192,0.06)",
              }}
            >
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={saving || selectedPendingCount === 0}
                onClick={() => void saveSelected()}
              >
                <i className="fa-solid fa-truck" style={{ marginRight: 8 }} />
                {saving
                  ? "Saving delivery…"
                  : selectedPendingCount === 0
                    ? "Select dresses to deliver"
                    : selectedPendingCount === 1
                      ? "Deliver Selected + Send Slip"
                      : `Deliver Selected (${selectedPendingCount}) + Combined Slip`}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={saving || selectedPendingCount === 0}
                onClick={() => void saveSelected({ openPrintSlip: true })}
                style={{ color: "#1565c0", borderColor: "#1565c0" }}
              >
                <i className="fa-solid fa-print" style={{ marginRight: 6 }} />
                Deliver &amp; Print A4
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={saving || selectedPendingCount === 0}
                onClick={() => void saveDetailsOnlySelected()}
              >
                Save payment details only
              </button>
            </div>
          )}
        </div>
      </div>

      {localOrders.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-scissors" style={{ marginRight: 8 }} />
              Custom Orders — Collect Balance
            </h3>
          </div>
          <div className="card-body">
            {localOrders.map((o) => {
              const outstanding = Math.max(0, o.balance - o.balanceCollected);
              return (
                <div
                  key={o.id}
                  style={{
                    border: "1.5px solid var(--border)",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                    {o.photo && (
                      <ZoomableImage src={photoUrl(o.photo)} alt={o.description} overlayCaption={o.description} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />
                    )}
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{o.description}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Delivery: {o.deliveryDate} {o.deliveryTime}
                      </div>
                    </div>
                    {o.includedInRent ? (
                      <span className="badge badge-info">Included in rent</span>
                    ) : outstanding > 0 ? (
                      <span className="badge badge-warning">Balance ₹{formatInr(outstanding)}</span>
                    ) : (
                      <span className="badge badge-success"><i className="fa-solid fa-check" /> Paid</span>
                    )}
                  </div>

                  {!o.includedInRent && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, fontSize: 13, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>COST</div>
                          <div>₹{formatInr(o.cost)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>ADVANCE</div>
                          <div style={{ color: "var(--success)" }}>₹{formatInr(o.advance)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>COLLECTED</div>
                          <div style={{ color: "var(--success)" }}>₹{formatInr(o.balanceCollected)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>OUTSTANDING</div>
                          <div style={{ fontWeight: 700, color: outstanding > 0 ? "var(--danger)" : "var(--success)" }}>
                            ₹{formatInr(outstanding)}
                          </div>
                        </div>
                      </div>
                      {outstanding > 0 && (
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <label className="form-label">Balance to Collect (₹)</label>
                            <input
                              type="number"
                              className="form-control"
                              value={orderForms[o.id] ?? ""}
                              onChange={(e) => setOrderForms((prev) => ({ ...prev, [o.id]: e.target.value }))}
                            />
                          </div>
                          <button
                            className="btn btn-success"
                            disabled={orderBusy === o.id}
                            onClick={() => collectOrder(o.id)}
                          >
                            <i className="fa-solid fa-indian-rupee-sign" style={{ marginRight: 6 }} />
                            {orderBusy === o.id ? "Saving…" : "Collect Balance"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {jewellery.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <h3 className="card-title" style={{ color: "#8a6d1a" }}>
              <i className="fa-solid fa-gem" style={{ marginRight: 8 }} />
              Selected Jewellery ({jewellery.length})
            </h3>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {jewellery.map((j) => (
                <div key={j.id} style={{ display: "flex", gap: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
                  {j.photo ? (
                    <ZoomableImage src={photoUrl(j.photo)} alt={j.name} overlayCaption={j.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 8, background: "var(--cream-dark)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 }}>
                      <i className="fa-solid fa-gem" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{j.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {j.source === "inventory" ? "Inventory" : "Manual"}
                      {j.category ? ` · ${j.category}` : ""}
                      {j.partsLabel ? ` · ${j.partsLabel}` : ""}
                    </div>
                    {j.note && j.note.split(" · ").filter(Boolean).map((p, i) => {
                      const isWarning = p === WARNING_RETURNING_ON_DELIVERY || p === WARNING_BOOKED_ON_RETURN;
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: 11,
                            color: isWarning ? "#E65100" : "var(--text-muted)",
                            marginTop: 4,
                            fontStyle: isWarning ? "normal" : "italic",
                          }}
                        >
                          {isWarning ? (
                            <><i className="fa-solid fa-triangle-exclamation" /> {p}</>
                          ) : (
                            <><i className="fa-solid fa-note-sticky" style={{ marginRight: 4 }} />{p}</>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3 className="card-title">
            <i className="fa-solid fa-receipt" style={{ marginRight: 8 }} />
            Payment Summary
          </h3>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, fontSize: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>TOTAL AMOUNT (RENT + ORDERS)</div>
              <div style={{ fontWeight: 800, color: "var(--primary)", fontSize: 18 }}>₹{formatInr(grandTotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>TOTAL ADVANCE</div>
              <div style={{ fontWeight: 700, color: "var(--success)", fontSize: 18 }}>₹{formatInr(grandAdvance)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>TOTAL BALANCE RECEIVED</div>
              <div style={{ fontWeight: 700, color: "var(--success)", fontSize: 18 }}>₹{formatInr(balanceReceived)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>REMAINING BALANCE</div>
              {remainingBalance > 0 ? (
                <div style={{ fontWeight: 800, color: "var(--danger)", fontSize: 18 }}>₹{formatInr(remainingBalance)}</div>
              ) : (
                <div style={{ fontWeight: 700, color: "var(--success)", fontSize: 18 }}>Fully Paid ✓</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
