import prisma from "@/lib/prisma";
import { formatBookingDateTime, formatDate } from "@/lib/constants";
import { dressDisplayName } from "@/lib/dress";

export type CancellationType = "all" | "full" | "partial";

export type CancelledDressRow = {
  id: number;
  name: string;
  category: string;
  size: string;
  rent: number;
  fitting: number;
  advance: number;
  notes: string;
  cancelled: boolean;
  cancelledOn: string;
  refund: number;
};

export type CancellationRecord = {
  bookingId: number;
  kind: "full" | "partial";
  serial: number;
  bookingNumber: string;
  customerName: string;
  contact1: string;
  contact2: string;
  whatsappNo: string;
  address: string;
  venue: string;
  staffNames: string;
  bookedOn: string;
  deliveryDate: string;
  deliveryTime: string;
  returnDate: string;
  returnTime: string;
  advancePaymentMode: string;
  securityDeposit: number;
  rent: number;
  fitting: number;
  advance: number;
  refund: number;
  retained: number;
  commonNotes: string;
  notes: string;
  /** ISO timestamp used for month filtering and sorting; "" when unknown. */
  cancelledAtIso: string;
  cancelledOn: string;
  cancelledBy: string;
  dresses: CancelledDressRow[];
};

const BOOKING_SELECT = {
  id: true,
  bookingNumber: true,
  monthlySerial: true,
  customerName: true,
  customerAddress: true,
  contact1: true,
  contact2: true,
  whatsappNo: true,
  venue: true,
  staffNames: true,
  createdAt: true,
  deliveryDate: true,
  deliveryTime: true,
  returnDate: true,
  returnTime: true,
  advancePaymentMode: true,
  securityDeposit: true,
  totalPrice: true,
  price: true,
  totalFittingCharges: true,
  totalAdvance: true,
  advance: true,
  refundAmount: true,
  refundedAt: true,
  commonNotes: true,
  deliveryNotes: true,
  notes: true,
  status: true,
  dressName: true,
  legacyItem: { select: { category: true, size: true } },
  bookingItems: {
    select: {
      id: true,
      dressName: true,
      category: true,
      size: true,
      price: true,
      fittingCharges: true,
      advance: true,
      notes: true,
      isCancelled: true,
      cancelledAt: true,
      cancelRefundAmount: true,
      item: { select: { size: true } },
    },
    orderBy: { id: "asc" as const },
  },
} as const;

function stamp(d: Date | null | undefined): string {
  if (!d) return "";
  const { date, time } = formatBookingDateTime(d);
  return `${date} ${time}`;
}

function inMonth(iso: string, month: string): boolean {
  if (!month) return true;
  if (!iso) return false;
  const local = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return local.slice(0, 7) === month;
}

function matchesQuery(r: CancellationRecord, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/^#/, "");
  const digits = needle.replace(/\D/g, "");
  const hay = [
    String(r.serial),
    String(r.serial).padStart(2, "0"),
    r.bookingNumber,
    r.customerName,
    r.address,
    r.venue,
    r.staffNames,
    ...r.dresses.map((d) => d.name),
  ]
    .join(" ")
    .toLowerCase();
  if (hay.includes(needle)) return true;
  if (digits.length >= 4) {
    return [r.contact1, r.contact2, r.whatsappNo].some((p) => (p || "").replace(/\D/g, "").includes(digits));
  }
  return false;
}

export async function getCancellationList(opts: { month?: string; q?: string; type?: CancellationType }) {
  const month = /^\d{4}-\d{2}$/.test(opts.month || "") ? (opts.month as string) : "";
  const q = (opts.q || "").trim();
  const type = opts.type || "all";

  const [fullBookings, partialBookings] = await Promise.all([
    type === "partial"
      ? Promise.resolve([])
      : prisma.booking.findMany({ where: { status: "cancelled" }, select: BOOKING_SELECT }),
    type === "full"
      ? Promise.resolve([])
      : prisma.booking.findMany({
          where: { status: { not: "cancelled" }, bookingItems: { some: { isCancelled: true } } },
          select: BOOKING_SELECT,
        }),
  ]);

  const bookingIds = fullBookings.map((b) => b.id);
  const itemIds = [...fullBookings, ...partialBookings].flatMap((b) =>
    b.bookingItems.filter((bi) => bi.isCancelled).map((bi) => bi.id),
  );
  const logs =
    bookingIds.length || itemIds.length
      ? await prisma.activityLog.findMany({
          where: {
            action: "cancelled",
            OR: [
              ...(bookingIds.length ? [{ entity: "booking", entityId: { in: bookingIds } }] : []),
              ...(itemIds.length ? [{ entity: "booking_item", entityId: { in: itemIds } }] : []),
            ],
          },
          select: { entity: true, entityId: true, username: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
  const latestLog = new Map<string, { username: string; createdAt: Date }>();
  for (const l of logs) {
    const key = `${l.entity}:${l.entityId}`;
    if (!latestLog.has(key)) latestLog.set(key, { username: l.username, createdAt: l.createdAt });
  }

  const build = (b: (typeof fullBookings)[number], kind: "full" | "partial"): CancellationRecord => {
    const items = b.bookingItems;
    const dresses: CancelledDressRow[] = items.length
      ? items.map((bi) => ({
          id: bi.id,
          name: dressDisplayName(bi.dressName, bi.category, bi.size || bi.item?.size),
          category: bi.category || "",
          size: bi.size || bi.item?.size || "",
          rent: bi.price || 0,
          fitting: bi.fittingCharges || 0,
          advance: bi.advance || 0,
          notes: bi.notes || "",
          cancelled: kind === "full" || bi.isCancelled,
          cancelledOn: stamp(bi.cancelledAt),
          refund: bi.cancelRefundAmount || 0,
        }))
      : [
          {
            id: 0,
            name: dressDisplayName(b.dressName || "", b.legacyItem?.category, b.legacyItem?.size),
            category: b.legacyItem?.category || "",
            size: b.legacyItem?.size || "",
            rent: b.totalPrice || b.price || 0,
            fitting: b.totalFittingCharges || 0,
            advance: b.totalAdvance || b.advance || 0,
            notes: "",
            cancelled: true,
            cancelledOn: "",
            refund: b.refundAmount || 0,
          },
        ];

    let cancelledAt: Date | null = null;
    let cancelledBy = "";
    if (kind === "full") {
      const log = latestLog.get(`booking:${b.id}`);
      const lastItemCancel = items
        .map((bi) => bi.cancelledAt)
        .filter((d): d is Date => d != null)
        .sort((x, y) => y.getTime() - x.getTime())[0];
      cancelledAt = log?.createdAt || lastItemCancel || b.refundedAt || null;
      cancelledBy =
        log?.username ||
        items
          .map((bi) => latestLog.get(`booking_item:${bi.id}`)?.username)
          .find(Boolean) ||
        "";
    } else {
      const cancelledItems = items.filter((bi) => bi.isCancelled);
      const latest = cancelledItems
        .filter((bi) => bi.cancelledAt)
        .sort((x, y) => y.cancelledAt!.getTime() - x.cancelledAt!.getTime())[0];
      cancelledAt = latest?.cancelledAt || null;
      cancelledBy = latest ? latestLog.get(`booking_item:${latest.id}`)?.username || "" : "";
    }

    const scope = kind === "full" ? dresses : dresses.filter((d) => d.cancelled);
    const rent = items.length ? scope.reduce((s, d) => s + d.rent, 0) : dresses[0].rent;
    const fitting = items.length ? scope.reduce((s, d) => s + d.fitting, 0) : dresses[0].fitting;
    const itemAdvance = scope.reduce((s, d) => s + d.advance, 0);
    const advance =
      kind === "full" ? Math.max(itemAdvance, b.totalAdvance || b.advance || 0) : itemAdvance;
    const refund =
      kind === "full" ? b.refundAmount || 0 : scope.reduce((s, d) => s + d.refund, 0);

    return {
      bookingId: b.id,
      kind,
      serial: b.monthlySerial,
      bookingNumber: b.bookingNumber,
      customerName: b.customerName,
      contact1: b.contact1 || "",
      contact2: b.contact2 || "",
      whatsappNo: b.whatsappNo || "",
      address: b.customerAddress || "",
      venue: b.venue || "",
      staffNames: b.staffNames || "",
      bookedOn: stamp(b.createdAt),
      deliveryDate: formatDate(b.deliveryDate, "display"),
      deliveryTime: b.deliveryTime || "",
      returnDate: formatDate(b.returnDate, "display"),
      returnTime: b.returnTime || "",
      advancePaymentMode: b.advancePaymentMode || "",
      securityDeposit: b.securityDeposit || 0,
      rent,
      fitting,
      advance,
      refund,
      retained: Math.max(0, advance - refund),
      commonNotes: (b.deliveryNotes?.trim() || b.commonNotes || "").trim(),
      notes: (b.notes || "").trim(),
      cancelledAtIso: cancelledAt ? cancelledAt.toISOString() : "",
      cancelledOn: stamp(cancelledAt),
      cancelledBy,
      dresses,
    };
  };

  const records = [
    ...fullBookings.map((b) => build(b, "full")),
    ...partialBookings.map((b) => build(b, "partial")),
  ]
    .filter((r) => inMonth(r.cancelledAtIso, month) && matchesQuery(r, q))
    .sort((a, b) => (b.cancelledAtIso || "").localeCompare(a.cancelledAtIso || "") || b.bookingId - a.bookingId);

  const totals = records.reduce(
    (t, r) => ({
      bookings: t.bookings + 1,
      full: t.full + (r.kind === "full" ? 1 : 0),
      partial: t.partial + (r.kind === "partial" ? 1 : 0),
      dresses: t.dresses + r.dresses.filter((d) => d.cancelled).length,
      rent: t.rent + r.rent,
      advance: t.advance + r.advance,
      refund: t.refund + r.refund,
      retained: t.retained + r.retained,
    }),
    { bookings: 0, full: 0, partial: 0, dresses: 0, rent: 0, advance: 0, refund: 0, retained: 0 },
  );

  return { records, totals, month, q, type };
}
