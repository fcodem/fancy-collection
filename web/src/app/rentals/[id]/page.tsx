import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";

export default async function RentalViewPage({ params }: { params: Promise<{ id: string }> }) {
const { id } = await params;
  const rental = await prisma.rental.findUnique({ where: { id: parseInt(id, 10) }, include: { customer: true, items: { include: { item: true } } } });
  if (!rental) notFound();
  return (
    <div className="card">
        <div className="card-header"><h3 className="card-title">{rental.rentalNumber}</h3></div>
        <div className="card-body">
          <p><strong>Customer:</strong> {rental.customer.name}</p>
          <p><strong>Status:</strong> {rental.status}</p>
          <p><strong>Total:</strong> ₹{rental.totalAmount.toLocaleString()}</p>
          <ul>{rental.items.map((ri) => <li key={ri.id}>{ri.item?.name ?? "—"} — ₹{ri.dailyRate}/day</li>)}</ul>
        </div>
      </div>
  );
}
