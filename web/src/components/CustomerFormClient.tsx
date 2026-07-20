"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { SaveConfirmedBanner } from "@/components/SaveConfirmedBanner";
import { buildSaveRedirectUrl } from "@/components/SaveConfirmedBanner";

export type CustomerSaveConfirmed = {
  title: string;
  detail?: string;
};

export default function CustomerFormClient({
  customer,
  saveConfirmed,
}: {
  customer?: Record<string, unknown>;
  saveConfirmed?: CustomerSaveConfirmed;
}) {
  const router = useRouter();
  const toast = useToast();
  const isEdit = Boolean(customer?.id);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const url = isEdit ? `/api/customers/${customer!.id}` : "/api/customers";
    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Failed");
      return;
    }

    const savedName = String(body.name || data.name || "").trim();

    if (isEdit) {
      toast("Customer updated", "success");
      router.replace(
        buildSaveRedirectUrl("/customers/add", {
          title: "Customer updated",
          detail: savedName,
        }),
      );
      router.refresh();
      window.scrollTo(0, 0);
      return;
    }

    toast("Customer saved", "success");
    router.replace(
      buildSaveRedirectUrl("/customers/add", {
        title: "Customer saved",
        detail: savedName,
      }),
    );
    router.refresh();
    window.scrollTo(0, 0);
  }

  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 520 }}>
      {saveConfirmed && (
        <SaveConfirmedBanner
          title={saveConfirmed.title}
          detail={saveConfirmed.detail}
          hint="Add another customer below."
        />
      )}
      <div className="card-header"><h3 className="card-title">{isEdit ? "Edit Customer" : "Add Customer"}</h3></div>
      <div className="card-body" style={{ display: "grid", gap: 16 }}>
        <div><label className="form-label">Name *</label><input name="name" className="form-control" required defaultValue={customer?.name as string} /></div>
        <div><label className="form-label">Phone *</label><input name="phone" className="form-control" inputMode="tel" required defaultValue={customer?.phone as string} /></div>
        <div><label className="form-label">Email</label><input name="email" type="email" className="form-control" defaultValue={customer?.email as string} /></div>
        <div><label className="form-label">Address</label><textarea name="address" className="form-control" defaultValue={customer?.address as string} /></div>
        <div><label className="form-label">ID Proof</label><input name="id_proof" className="form-control" defaultValue={customer?.idProof as string} /></div>
        <div><label className="form-label">Notes</label><textarea name="notes" className="form-control" defaultValue={customer?.notes as string} /></div>
        <button className="btn btn-primary">{isEdit ? "Update" : "Add"}</button>
      </div>
    </form>
  );
}
