"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInr } from "@/lib/format";
import { formatDate } from "@/lib/constants";
import { photoUrl } from "@/lib/photoUrl";
import { useToast } from "@/components/ui/Toast";
import ZoomableImage from "@/components/ZoomableImage";

export type OrderListRow = {
  id: number;
  bookingId: number;
  monthlySerial: number;
  customerName: string;
  contact1: string;
  whatsappNo: string | null;
  description: string;
  cost: number;
  advance: number;
  balance: number;
  balanceCollected: number;
  photo: string | null;
  deliveryDate: string;
  deliveryTime: string;
  collectedAt: string | null;
  readyAt: string | null;
};

function dateLabel(iso: string) {
  return formatDate(iso.slice(0, 10), "display");
}

export default function OrdersListClient({ orders, todayIso }: { orders: OrderListRow[]; todayIso: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function collect(o: OrderListRow) {
    const outstanding = Math.max(0, o.balance - o.balanceCollected);
    const input = window.prompt(
      `Collect balance for order (customer ${o.customerName}).\nOutstanding: ₹${formatInr(outstanding)}\nEnter amount to collect:`,
      String(outstanding),
    );
    if (input == null) return;
    const amount = Number(input);
    if (Number.isNaN(amount) || amount < 0) {
      toast("Enter a valid amount", "error");
      return;
    }
    setBusyId(o.id);
    try {
      const res = await fetch(`/api/booking/${o.bookingId}/orders/${o.id}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance_collected: amount }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast("Balance recorded", "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleReady(o: OrderListRow, ready: boolean) {
    setBusyId(o.id);
    try {
      const res = await fetch(`/api/booking/${o.bookingId}/orders/${o.id}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ready }),
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast(ready ? "Order marked ready" : "Order moved back to not ready", ready ? "success" : "info");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(o: OrderListRow) {
    if (!window.confirm(`Cancel this order for ${o.customerName}? Any collected money will be logged as a refund.`)) return;
    setBusyId(o.id);
    try {
      const res = await fetch(`/api/booking/${o.bookingId}/orders/${o.id}/cancel`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast("Order cancelled", "info");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  const notReady = orders.filter((o) => !o.readyAt);
  const ready = orders.filter((o) => o.readyAt);

  function renderTable(list: OrderListRow[], isReadySection: boolean) {
    if (list.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontSize: 13 }}>
          {isReadySection ? "No orders marked ready yet." : "No pending orders."}
        </div>
      );
    }
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Customer</th>
              <th>Order</th>
              <th>Delivery</th>
              <th style={{ textAlign: "right" }}>Cost</th>
              <th style={{ textAlign: "right" }}>Advance</th>
              <th style={{ textAlign: "right" }}>Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const overdue = !isReadySection && new Date(o.deliveryDate) < new Date(todayIso);
              const outstanding = Math.max(0, o.balance - o.balanceCollected);
              const src = photoUrl(o.photo);
              return (
                <tr key={o.id} style={overdue ? { background: "rgba(220,53,69,0.05)" } : undefined}>
                  <td>
                    <Link href={`/booking/${o.bookingId}`} style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 700 }}>
                      #{String(o.monthlySerial).padStart(2, "0")}
                    </Link>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.customerName}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{o.contact1}</div>
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <div>{o.description}</div>
                    {src && (
                      <ZoomableImage
                        src={src}
                        alt="Sample"
                        overlayCaption={o.description}
                        style={{ marginTop: 6, maxHeight: 60, maxWidth: 90, borderRadius: 6, border: "1px solid var(--border)", objectFit: "cover" }}
                      />
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: overdue ? "var(--danger)" : "var(--gold-dark, #8a6d1a)" }}>
                      {overdue ? "OVERDUE · " : ""}{dateLabel(o.deliveryDate)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{o.deliveryTime}</div>
                  </td>
                  <td style={{ textAlign: "right" }}>{o.cost === 0 ? <em>In rent</em> : `₹${formatInr(o.cost)}`}</td>
                  <td style={{ textAlign: "right", color: "var(--success)" }}>₹{formatInr(o.advance)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: outstanding > 0 ? "var(--danger)" : "var(--success)" }}>
                    ₹{formatInr(outstanding)}
                    {o.balanceCollected > 0 && outstanding > 0 && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Collected ₹{formatInr(o.balanceCollected)}</div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Link href={`/booking/${o.bookingId}`} className="btn btn-sm btn-outline">
                        View Booking
                      </Link>
                      {isReadySection ? (
                        <button type="button" className="btn btn-sm btn-outline" disabled={busyId === o.id} onClick={() => toggleReady(o, false)}>
                          Not Ready
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm btn-primary" disabled={busyId === o.id} onClick={() => toggleReady(o, true)}>
                          <i className="fa-solid fa-check" style={{ marginRight: 4 }} />
                          Ready
                        </button>
                      )}
                      {outstanding > 0 && (
                        <button type="button" className="btn btn-sm btn-success" disabled={busyId === o.id} onClick={() => collect(o)}>
                          Collect
                        </button>
                      )}
                      <button type="button" className="btn btn-sm btn-danger" disabled={busyId === o.id} onClick={() => cancel(o)}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
        No active custom orders.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20, padding: 16 }}>
      <section>
        <h4 style={{ margin: "0 0 10px", color: "#c2410c", display: "flex", alignItems: "center", gap: 8 }}>
          <i className="fa-solid fa-hourglass-half" />
          Not Ready ({notReady.length})
        </h4>
        {renderTable(notReady, false)}
      </section>
      <section>
        <h4 style={{ margin: "0 0 10px", color: "var(--success)", display: "flex", alignItems: "center", gap: 8 }}>
          <i className="fa-solid fa-circle-check" />
          Ready ({ready.length})
        </h4>
        {renderTable(ready, true)}
      </section>
    </div>
  );
}
