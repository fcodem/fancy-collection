import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { todayIso } from "@/lib/constants";
import OrdersListClient, { type OrderListRow } from "@/components/OrdersListClient";

export const metadata: Metadata = { title: "Custom Orders" };

export default async function OrdersPage() {
  const orders = await prisma.bookingOrder.findMany({
    where: { status: "active" },
    orderBy: { deliveryDate: "asc" },
    include: {
      booking: {
        select: {
          id: true,
          monthlySerial: true,
          customerName: true,
          contact1: true,
          whatsappNo: true,
        },
      },
    },
  });

  const rows: OrderListRow[] = orders.map((o) => ({
    id: o.id,
    bookingId: o.booking.id,
    monthlySerial: o.booking.monthlySerial,
    customerName: o.booking.customerName,
    contact1: o.booking.contact1,
    whatsappNo: o.booking.whatsappNo,
    description: o.description,
    cost: o.cost,
    advance: o.advance,
    balance: o.balance,
    balanceCollected: o.balanceCollected,
    photo: o.photo,
    deliveryDate: o.deliveryDate.toISOString(),
    deliveryTime: o.deliveryTime,
    collectedAt: o.collectedAt ? o.collectedAt.toISOString() : null,
    readyAt: o.readyAt ? o.readyAt.toISOString() : null,
  }));

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title" style={{ color: "#8a6d1a" }}>
          <i className="fa-solid fa-scissors" style={{ marginRight: 8 }} />
          Custom Orders ({rows.length})
        </h3>
      </div>
      <div className="card-body p-0">
        <OrdersListClient orders={rows} todayIso={todayIso()} />
      </div>
    </div>
  );
}
