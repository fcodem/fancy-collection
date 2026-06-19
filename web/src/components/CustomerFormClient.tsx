"use client";

import { useRouter } from "next/navigation";

export default function CustomerFormClient({ customer }: { customer?: Record<string, unknown> }) {
  const router = useRouter();
  const isEdit = Boolean(customer?.id);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const url = isEdit ? `/api/customers/${customer!.id}` : "/api/customers";
    const res = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) router.push("/customers");
    else alert((await res.json()).error);
  }

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 520 }}>
      <div className="card-header"><h3 className="card-title">{isEdit ? "Edit Customer" : "Add Customer"}</h3></div>
      <div className="card-body" style={{ display: "grid", gap: 16 }}>
        <div><label className="form-label">Name *</label><input name="name" className="form-control" required defaultValue={customer?.name as string} /></div>
        <div><label className="form-label">Phone *</label><input name="phone" className="form-control" required defaultValue={customer?.phone as string} /></div>
        <div><label className="form-label">Email</label><input name="email" type="email" className="form-control" defaultValue={customer?.email as string} /></div>
        <div><label className="form-label">Address</label><textarea name="address" className="form-control" defaultValue={customer?.address as string} /></div>
        <div><label className="form-label">ID Proof</label><input name="id_proof" className="form-control" defaultValue={customer?.idProof as string} /></div>
        <div><label className="form-label">Notes</label><textarea name="notes" className="form-control" defaultValue={customer?.notes as string} /></div>
        <button className="btn btn-primary">{isEdit ? "Update" : "Add"}</button>
      </div>
    </form>
  );
}
