import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/services/customersOps";
import { getCurrentUser, isOwner } from "@/lib/auth";
import CustomerFormClient from "@/components/CustomerFormClient";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOwner(user)) redirect("/");

  const { id } = await params;
  const customer = await getCustomer(parseInt(id, 10));
  if (!customer) notFound();

  return (
    <>
      <div style={{ marginBottom: 16 }}><Link href="/customers" className="btn btn-outline btn-sm">← Back</Link></div>
      <CustomerFormClient customer={customer as unknown as Record<string, unknown>} />
      {customer.rentals.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header"><h3 className="card-title">Rental History</h3></div>
          <div className="card-body p-0">
            <table className="data-table">
              <thead><tr><th>Rental #</th><th>Status</th><th>Amount</th></tr></thead>
              <tbody>
                {customer.rentals.map((r) => (
                  <tr key={r.id}><td>{r.rentalNumber}</td><td>{r.status}</td><td>₹{r.totalAmount.toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
