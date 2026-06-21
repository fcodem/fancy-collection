"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { fetchJson } from "@/lib/fetchJson";
import { todayIso } from "@/lib/constants";
import type { ComponentProps } from "react";
import type BookingFormClient from "@/components/BookingFormClient";

const LazyBookingForm = dynamic(() => import("@/components/BookingFormClient"), {
  loading: () => (
    <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
      Loading editor…
    </div>
  ),
  ssr: false,
});

type FormProps = ComponentProps<typeof BookingFormClient>;

type EditFormPayload = {
  staffList: string[];
  mensCategories: string[];
  womensCategories: string[];
  jewelleryCategories: string[];
  accessoryCategories: string[];
  initial: FormProps["initial"];
};

export default function DeliveredBookingEditSection({ bookingId }: { bookingId: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formProps, setFormProps] = useState<Omit<FormProps, "today"> | null>(null);

  async function openEditor() {
    setOpen(true);
    if (formProps) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<EditFormPayload>(`/api/booking/${bookingId}/edit-form-data`);
      setFormProps({
        editId: bookingId,
        afterSaveHref: `/booking-delivery/${bookingId}`,
        initial: data.initial,
        staffList: data.staffList,
        mensCategories: data.mensCategories,
        womensCategories: data.womensCategories,
        jewelleryCategories: data.jewelleryCategories,
        accessoryCategories: data.accessoryCategories,
      });
    } catch {
      setError("Could not load the editor. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Edit Booking &amp; Change Dress</h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
            Availability warnings match the new booking panel. Previous dress is freed when changed.
          </p>
          <button type="button" className="btn btn-outline" onClick={() => void openEditor()}>
            <i className="fa-solid fa-pen" style={{ marginRight: 8 }} />
            Open Editor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-header">
        <h3 className="card-title">Edit Booking &amp; Change Dress</h3>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
          Collapse
        </button>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
            Loading…
          </div>
        )}
        {error && (
          <div className="alert alert-error" style={{ margin: 16 }}>
            {error}{" "}
            <button type="button" className="btn btn-sm btn-outline" onClick={() => void openEditor()}>
              Retry
            </button>
          </div>
        )}
        {formProps && !loading && (
          <LazyBookingForm today={todayIso()} {...formProps} />
        )}
      </div>
    </div>
  );
}
