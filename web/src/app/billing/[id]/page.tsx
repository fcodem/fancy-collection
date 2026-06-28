import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";

export default async function BillingViewPage({ params }: { params: Promise<{ id: string }> }) {
const { id } = await params;
  const invoice = await prisma.invoice.findUnique({ where: { id: parseInt(id, 10) }, include: { rental: { include: { customer: true } }, payments: true } });
  if (!invoice) notFound();
  return (
    <div className="card">
        <div className="card-header">
          <h3 className="card-title">{invoice.invoiceNumber}</h3>
          <a href={`/billing/${invoice.id}/print`} className="btn btn-primary btn-sm">Print</a>
        </div>
        <div className="card-body">
          <p>Customer: {invoice.rental.customer.name}</p>
          <p>Total: ₹{invoice.total.toLocaleString()} · Paid: ₹{invoice.amountPaid.toLocaleString()}</p>
        </div>
      </div>
  );
}
