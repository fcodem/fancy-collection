"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { todayIso } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import { SaveConfirmedBanner } from "@/components/SaveConfirmedBanner";
import { buildSaveRedirectUrl } from "@/components/SaveConfirmedBanner";

export type ShopEnquiryFormValues = {
  customerName: string;
  contact1: string;
  whatsapp: string;
  enquiryNotes: string;
  visitDate: string;
  deliveryDates: string[];
  staffNames: string[];
};

type Props = {
  staffList: string[];
  today?: string;
  saveConfirmed?: { title: string; detail?: string };
  enquiryId?: number;
  initial?: ShopEnquiryFormValues;
};

function defaultDeliveryDates(initial?: string[]) {
  if (initial?.length) return initial;
  return [""];
}

export default function ShopEnquiryFormClient({
  staffList,
  today,
  saveConfirmed,
  enquiryId,
  initial,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const visitDefault = today || todayIso();
  const editing = enquiryId != null;

  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [contact1, setContact1] = useState(initial?.contact1 ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [enquiryNotes, setEnquiryNotes] = useState(initial?.enquiryNotes ?? "");
  const [visitDate, setVisitDate] = useState(initial?.visitDate ?? visitDefault);
  const [deliveryDates, setDeliveryDates] = useState<string[]>(() =>
    defaultDeliveryDates(initial?.deliveryDates),
  );
  const [staffNames, setStaffNames] = useState<string[]>(initial?.staffNames ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleStaff(name: string) {
    setStaffNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  function addDeliveryDate() {
    setDeliveryDates((prev) => [...prev, ""]);
  }

  function updateDeliveryDate(index: number, value: string) {
    setDeliveryDates((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  function removeDeliveryDate(index: number) {
    setDeliveryDates((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
  }

  function resetForm() {
    if (editing && initial) {
      setCustomerName(initial.customerName);
      setContact1(initial.contact1);
      setWhatsapp(initial.whatsapp);
      setEnquiryNotes(initial.enquiryNotes);
      setVisitDate(initial.visitDate);
      setDeliveryDates(defaultDeliveryDates(initial.deliveryDates));
      setStaffNames(initial.staffNames);
    } else {
      setCustomerName("");
      setContact1("");
      setWhatsapp("");
      setEnquiryNotes("");
      setVisitDate(visitDefault);
      setDeliveryDates([""]);
      setStaffNames([]);
    }
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
      const payload = {
        customer_name: customerName,
        contact_1: contact1,
        whatsapp_no: whatsapp,
        enquiry_notes: enquiryNotes,
        staff_names: staffNames,
        visit_date: visitDate,
        delivery_dates: deliveryDates.filter((d) => d.trim()),
      };
      const res = await fetch(
        editing ? `/api/shop-enquiries/${enquiryId}` : "/api/shop-enquiries",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      const savedName = customerName.trim();
      toast(editing ? "Shop enquiry updated" : "Shop enquiry saved", "success");
      if (editing) {
        router.push("/prospect-leads");
        router.refresh();
        return;
      }
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
        {editing ? " › Edit Enquiry" : " › Add Enquiry"}
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
              {editing ? "Edit Shop Enquiry" : "Shop Enquiry"}
            </h3>
          </div>
          <div className="card-body form-grid">
            <div className="form-group full-width">
              <label className="form-label">Customer Name *</label>
              <input className="form-control" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Delivery Dates</label>
                <button type="button" className="btn btn-outline btn-sm" onClick={addDeliveryDate}>
                  <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                  Add Date
                </button>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {deliveryDates.map((date, index) => (
                  <div key={`delivery-date-${index}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="date"
                      className="form-control"
                      value={date}
                      onChange={(e) => updateDeliveryDate(index, e.target.value)}
                      aria-label={`Delivery date ${index + 1}`}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => removeDeliveryDate(index)}
                      title="Remove date"
                      aria-label="Remove delivery date"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                ))}
              </div>
              <span className="form-hint">Add every delivery date the customer asked about.</span>
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
              {saving ? "Saving…" : editing ? "Update Enquiry" : "Save Enquiry"}
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
