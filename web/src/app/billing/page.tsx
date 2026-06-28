import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";

export default async function BillingPage() {
const invoices = await prisma.invoice.findMany({ include: { rental: { include: { customer: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="card">
        <div className="card-header"><h3 className="card-title">Billing (Legacy)</h3></div>
        <div className="card-body p-0">
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Customer</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td><Link href={`/billing/${inv.id}`}>{inv.invoiceNumber}</Link></td>
                  <td>{inv.rental.customer.name}</td>
                  <td>₹{inv.total.toLocaleString()}</td>
                  <td>₹{inv.amountPaid.toLocaleString()}</td>
                  <td>{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  );
}
