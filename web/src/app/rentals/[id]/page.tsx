import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUserReadOnly } from "@/lib/auth";

export default async function RentalViewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  const { id } = await params;
  const rental = await prisma.rental.findUnique({
    where: { id: parseInt(id, 10) },
    select: {
      rentalNumber: true,
      status: true,
      totalAmount: true,
      customer: { select: { name: true } },
      items: {
        select: {
          id: true,
          dailyRate: true,
          item: { select: { name: true } },
        },
      },
    },
  });
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
