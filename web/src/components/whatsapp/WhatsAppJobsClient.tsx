"use client";

import { useEffect, useState } from "react";
import { isTransientNetworkError } from "@/lib/fetchJson";

type Job = {
  id: number;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  completed_at: string | null;
  failed_reason: string | null;
  created_at: string;
  sent_phone: string | null;
  meta_message_id: string | null;
  delivery_status: string | null;
  delivery_error: string | null;
  delivered_at: string | null;
  read_at: string | null;
  booking_contact1: string | null;
  booking_whatsapp_no: string | null;
  phone_mismatch: boolean;
  booking?: {
    customer_name: string;
    public_booking_id: string | null;
    serial: number;
  } | null;
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#fef3c7", color: "#d97706" },
  processing: { bg: "#dbeafe", color: "#2563eb" },
  done: { bg: "#dbeafe", color: "#1d4ed8" },
  failed: { bg: "#fee2e2", color: "#dc2626" },
  cancelled: { bg: "#f3f4f6", color: "#6b7280" },
};

const DELIVERY_COLORS: Record<string, { bg: string; color: string }> = {
  sent: { bg: "#f3f4f6", color: "#6b7280" },
  delivered: { bg: "#dcfce7", color: "#16a34a" },
  read: { bg: "#dbeafe", color: "#2563eb" },
  failed: { bg: "#fee2e2", color: "#dc2626" },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  booking_bill: "📄 Booking Slip",
  delivery_slip: "📦 Delivery Slip",
  return_receipt: "✅ Return Receipt",
  return_slip: "↩️ Return Slip",
  incomplete_slip: "⚠️ Incomplete Return",
  booking_reminder: "⏰ Return Reminder",
  postponement_notice: "📅 Postponement Notice",
  postponement_held: "📅 Postponement Slip",
  custom_template: "📢 Custom Template",
};

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

function jobStatusLabel(status: string, metaMessageId: string | null): string {
  if (status === "done") {
    return metaMessageId ? "Sent to Meta" : "Completed";
  }
  return status;
}

function isProviderOutcomeUnknown(reason: string | null): boolean {
  return Boolean(reason?.startsWith("PROVIDER_OUTCOME_UNKNOWN:"));
}

function canRetryJob(job: Job): boolean {
  if (job.meta_message_id?.trim()) return false;
  if (isProviderOutcomeUnknown(job.failed_reason)) return false;
  return job.status === "failed" || job.status === "processing";
}

function deliveryStatusLabel(status: string | null, jobDone: boolean): string {
  if (!status) {
    return jobDone ? "Unknown (no webhook yet)" : "—";
  }
  if (status === "sent") return "Sent to WhatsApp servers";
  if (status === "delivered") return "Delivered to phone";
  if (status === "read") return "Read by customer";
  if (status === "failed") return "Delivery failed";
  return status;
}

export default function WhatsAppJobsClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [retrying, setRetrying] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const url = statusFilter
        ? `/api/whatsapp/jobs?status=${statusFilter}&limit=100`
        : `/api/whatsapp/jobs?limit=100`;
      const res = await fetch(url);
      const data = await res.json() as { jobs?: Job[] };
      setJobs(data.jobs || []);
    } catch (e) {
      if (!isTransientNetworkError(e)) console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const retryJob = async (jobId: number) => {
    if (retrying != null) return;
    setRetrying(jobId);
    try {
      const res = await fetch(`/api/whatsapp/jobs/${jobId}/retry`, { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) load();
      else alert(data.error || "Retry failed");
    } catch {
      alert("Retry failed");
    } finally {
      setRetrying(null);
    }
  };

  const deleteJob = async (jobId: number) => {
    if (!confirm(`Delete job #${jobId} from the queue?`)) return;
    setDeleting(jobId);
    try {
      const res = await fetch(`/api/whatsapp/jobs/${jobId}`, { method: "DELETE" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      } else {
        alert(data.error || "Delete failed");
      }
    } catch {
      alert("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const clearQueue = async () => {
    const label = statusFilter ? `${statusFilter} jobs` : "all jobs in the queue";
    if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    setClearing(true);
    try {
      const res = await fetch("/api/whatsapp/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          statusFilter ? { status: statusFilter } : { all: true },
        ),
      });
      const data = await res.json() as { ok?: boolean; deleted?: number; error?: string };
      if (data.ok) {
        alert(`Deleted ${data.deleted ?? 0} job(s).`);
        load();
      } else {
        alert(data.error || "Clear queue failed");
      }
    } catch {
      alert("Clear queue failed");
    } finally {
      setClearing(false);
    }
  };

  const runQueue = async () => {
    try {
      const res = await fetch("/api/whatsapp/jobs/process", { method: "POST" });
      const data = await res.json() as {
        ok?: boolean;
        succeeded?: number;
        failed?: number;
        processed?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        alert(data.error || "Failed to run queue");
        return;
      }
      alert(
        `Queue processed: ${data.succeeded ?? 0} accepted by Meta, ${data.failed ?? 0} failed (${data.processed ?? 0} total)`,
      );
      load();
    } catch {
      alert("Failed to run queue");
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const filterBtns: Array<{ value: string; label: string }> = [
    { value: "", label: "All" },
    { value: "pending", label: "pending" },
    { value: "processing", label: "processing" },
    { value: "done", label: "Sent to Meta" },
    { value: "failed", label: "failed" },
    { value: "cancelled", label: "cancelled" },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <i className="fa-solid fa-list-ul" style={{ fontSize: 24, color: "#16a34a" }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1f2937", margin: 0 }}>WhatsApp Job Queue</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0 0" }}>
              &quot;Sent to Meta&quot; means Meta accepted the message — check delivery status for whether the customer received it
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={clearQueue}
            disabled={clearing || jobs.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, background: clearing ? "#fca5a5" : "#fff", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 12, padding: "8px 16px", fontSize: 13, cursor: clearing || jobs.length === 0 ? "not-allowed" : "pointer", fontWeight: 500, opacity: jobs.length === 0 ? 0.5 : 1 }}
          >
            <i className="fa-solid fa-trash" style={{ fontSize: 12 }} />
            {clearing ? "Clearing..." : statusFilter ? `Clear ${statusFilter}` : "Clear Queue"}
          </button>
          <button
            onClick={runQueue}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", borderRadius: 12, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
          >
            <i className="fa-solid fa-arrows-rotate" style={{ fontSize: 12 }} />
            Run Queue Now
          </button>
          <button
            onClick={load}
            style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #d1d5db", background: "#fff", borderRadius: 12, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
          >
            <i className="fa-solid fa-arrows-rotate" style={{ fontSize: 12 }} />
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: 12,
          color: "#92400e",
          lineHeight: 1.6,
        }}
      >
        <strong>Why messages may not arrive even when Meta accepts them:</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>
            <strong>Development mode:</strong> In Meta → WhatsApp → API Setup, add recipient numbers under &quot;To&quot; (test list). Only those numbers receive messages until the app is live.
          </li>
          <li>
            <strong>Wrong WhatsApp number on booking:</strong> Messages go to the WhatsApp No field first, not Contact 1. Fix the booking and retry.
          </li>
          <li>
            <strong>Webhook required for delivery status:</strong> On localhost, Meta cannot reach your webhook — delivery shows &quot;Unknown&quot;. Use ngrok or production URL for real delivery updates.
          </li>
        </ul>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {filterBtns.map(({ value, label }) => (
          <button
            key={value || "all"}
            onClick={() => setStatusFilter(value)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              border: statusFilter === value ? "1px solid #16a34a" : "1px solid #d1d5db",
              background: statusFilter === value ? "#16a34a" : "#fff",
              color: statusFilter === value ? "#fff" : "#4b5563",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>Loading...</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>No jobs found</div>
        ) : (
          <div>
            {jobs.map((job, idx) => {
              const sc = STATUS_COLORS[job.status] || { bg: "#f3f4f6", color: "#6b7280" };
              const dc = job.delivery_status
                ? DELIVERY_COLORS[job.delivery_status] || { bg: "#f3f4f6", color: "#6b7280" }
                : null;

              return (
                <div
                  key={job.id}
                  style={{
                    padding: 16,
                    borderBottom: idx < jobs.length - 1 ? "1px solid #f3f4f6" : "none",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 500, fontSize: 13, color: "#1f2937" }}>
                        {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: sc.bg, color: sc.color }}>
                        {jobStatusLabel(job.status, job.meta_message_id)}
                      </span>
                      {job.status === "done" && job.meta_message_id && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: dc?.bg ?? "#fef3c7",
                            color: dc?.color ?? "#d97706",
                          }}
                        >
                          {deliveryStatusLabel(job.delivery_status, Boolean(job.meta_message_id))}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>#{job.id}</span>
                    </div>

                    {job.booking && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        {job.booking.customer_name} · {job.booking.public_booking_id ?? `#${job.booking.serial}`}
                      </div>
                    )}

                    {job.sent_phone && (
                      <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
                        <i className="fa-brands fa-whatsapp" style={{ color: "#25d366", marginRight: 6 }} />
                        Sent to: <strong>{formatPhone(job.sent_phone)}</strong>
                        {job.booking_contact1 && (
                          <span style={{ color: "#9ca3af" }}>
                            {" "}
                            · Contact 1: {formatPhone(job.booking_contact1)}
                          </span>
                        )}
                      </div>
                    )}

                    {job.phone_mismatch && (
                      <div style={{ fontSize: 11, color: "#d97706", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 10 }} />
                        WhatsApp No ({formatPhone(job.booking_whatsapp_no)}) differs from Contact 1 — message went to WhatsApp No
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>Scheduled: {new Date(job.scheduled_at).toLocaleString("en-IN")}</span>
                      <span>Attempts: {job.attempts}/{job.max_attempts}</span>
                      {job.meta_message_id && (
                        <span>Meta accepted: {new Date(job.completed_at ?? job.created_at).toLocaleString("en-IN")}</span>
                      )}
                      {job.delivered_at && (
                        <span style={{ color: "#16a34a" }}>Delivered: {new Date(job.delivered_at).toLocaleString("en-IN")}</span>
                      )}
                    </div>

                    {job.delivery_error && (
                      <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 10 }} />
                        Delivery error: {job.delivery_error}
                      </div>
                    )}

                    {job.failed_reason && (
                      <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 10 }} />
                        {job.failed_reason}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => deleteJob(job.id)}
                      disabled={deleting === job.id}
                     
                      title="Delete job"
                      style={{
                        fontSize: 12,
                        background: "#fff",
                        color: "#dc2626",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        padding: "4px 10px",
                        cursor: deleting === job.id ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <i className="fa-solid fa-trash" style={{ fontSize: 11 }} />
                      {deleting === job.id ? "..." : "Delete"}
                    </button>
                    {canRetryJob(job) && (
                      <button
                        onClick={() => retryJob(job.id)}
                        disabled={retrying === job.id || retrying != null}
                        style={{
                          fontSize: 12,
                          background: job.status === "processing" ? "#eff6ff" : "#fffbeb",
                          color: job.status === "processing" ? "#2563eb" : "#d97706",
                          border: job.status === "processing" ? "1px solid #bfdbfe" : "1px solid #fde68a",
                          borderRadius: 8,
                          padding: "4px 10px",
                          cursor: retrying === job.id ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <i className="fa-solid fa-rotate-left" style={{ fontSize: 11 }} />
                        {retrying === job.id ? "Retrying..." : job.status === "processing" ? "Unstick & Retry" : "Retry"}
                      </button>
                    )}
                    {job.status === "done" && job.delivery_status === "delivered" && (
                      <i className="fa-solid fa-circle-check" style={{ color: "#16a34a", fontSize: 18 }} title="Delivered" />
                    )}
                    {job.status === "done" && job.delivery_status === "read" && (
                      <i className="fa-solid fa-check-double" style={{ color: "#2563eb", fontSize: 18 }} title="Read" />
                    )}
                    {job.status === "done" && !job.delivery_status && (
                      <i className="fa-solid fa-clock" style={{ color: "#d97706", fontSize: 18 }} title="Awaiting delivery confirmation" />
                    )}
                    {job.status === "done" && job.delivery_status === "failed" && (
                      <i className="fa-solid fa-circle-xmark" style={{ color: "#f87171", fontSize: 18 }} title="Delivery failed" />
                    )}
                    {job.status === "failed" && (
                      <i className="fa-solid fa-circle-xmark" style={{ color: "#f87171", fontSize: 18 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
