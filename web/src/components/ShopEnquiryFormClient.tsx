"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { todayIso } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { SaveConfirmedBanner } from "@/components/SaveConfirmedBanner";
import { buildSaveRedirectUrl } from "@/components/SaveConfirmedBanner";

type Props = {
  staffList: string[];
  today?: string;
  saveConfirmed?: { title: string; detail?: string };
};

export default function ShopEnquiryFormClient({ staffList, today, saveConfirmed }: Props) {
  const router = useRouter();
  const toast = useToast();
  const visitDefault = today || todayIso();

  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [contact1, setContact1] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [enquiryNotes, setEnquiryNotes] = useState("");
  const [visitDate, setVisitDate] = useState(visitDefault);
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleStaff(name: string) {
    setStaffNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  function resetForm() {
    setCustomerName("");
    setCustomerAddress("");
    setContact1("");
    setWhatsapp("");
    setEnquiryNotes("");
    setVisitDate(visitDefault);
    setStaffNames([]);
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerName.trim()) {
      setError("Customer name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/shop-enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          customer_name: customerName,
          customer_address: customerAddress,
          contact_1: contact1,
          whatsapp_no: whatsapp,
          enquiry_notes: enquiryNotes,
          staff_names: staffNames,
          visit_date: visitDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      const savedName = customerName.trim();
      toast("Shop enquiry saved", "success");
      resetForm();
      router.replace(
        buildSaveRedirectUrl("/shop-enquiries/new", {
          title: "Shop enquiry saved",
          detail: savedName,
        }),
      );
      router.refresh();
      window.scrollTo(0, 0);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: "var(--text-muted)" }}>
        <Link href="/prospect-leads" style={{ color: "var(--primary)", textDecoration: "none" }}>
          Prospect & Enquiries
        </Link>
        {" › Add Enquiry"}
      </div>

      {saveConfirmed && (
        <SaveConfirmedBanner
          title={saveConfirmed.title}
          detail={saveConfirmed.detail}
          hint="Enter the next enquiry below."
        />
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <form onSubmit={save}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-circle-question" style={{ marginRight: 8 }} />
              Shop Enquiry
            </h3>
          </div>
          <div className="card-body form-grid">
            <div className="form-group full-width">
              <label className="form-label">Customer Name *</label>
              <input className="form-control" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Address</label>
              <textarea className="form-control" rows={2} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Contact</label>
              <input className="form-control" value={contact1} onChange={(e) => setContact1(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">WhatsApp</label>
              <input className="form-control" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Visit Date</label>
              <input type="date" className="form-control" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Enquiry Notes</label>
              <textarea
                className="form-control"
                rows={3}
                value={enquiryNotes}
                onChange={(e) => setEnquiryNotes(e.target.value)}
                placeholder="What did the customer ask about?"
              />
            </div>
            {staffList.length > 0 && (
              <div className="form-group full-width">
                <label className="form-label">Staff Present</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {staffList.map((name) => (
                    <label key={name} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={staffNames.includes(name)} onChange={() => toggleStaff(name)} />
                      {name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-body" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
              {saving ? "Saving…" : "Save Enquiry"}
            </button>
            <Link href="/prospect-leads" className="btn btn-outline btn-lg">
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
