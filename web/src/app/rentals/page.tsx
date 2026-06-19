import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";

export default async function RentalsPage() {
const rentals = await prisma.rental.findMany({ include: { customer: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <ServerAppShell>
      <div className="card">
        <div className="card-header"><h3 className="card-title">Rentals (Legacy)</h3></div>
        <div className="card-body p-0">
          <table className="data-table">
            <thead><tr><th>Rental #</th><th>Customer</th><th>Status</th><th>Amount</th><th>Dates</th></tr></thead>
            <tbody>
              {rentals.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/rentals/${r.id}`}>{r.rentalNumber}</Link></td>
                  <td>{r.customer.name}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  <td>₹{r.totalAmount.toLocaleString()}</td>
                  <td>{r.startDate.toISOString().slice(0, 10)} → {r.endDate.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ServerAppShell>
  );
}
