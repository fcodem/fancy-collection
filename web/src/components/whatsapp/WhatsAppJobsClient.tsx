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
  booking?: {
    customer_name: string;
    public_booking_id: string | null;
    serial: number;
  } | null;
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#fef3c7", color: "#d97706" },
  processing: { bg: "#dbeafe", color: "#2563eb" },
  done: { bg: "#dcfce7", color: "#16a34a" },
  failed: { bg: "#fee2e2", color: "#dc2626" },
  cancelled: { bg: "#f3f4f6", color: "#6b7280" },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  booking_bill: "📄 Booking Slip",
  booking_reminder: "⏰ Return Reminder",
  postponement_notice: "📅 Postponement Notice",
  custom_template: "📢 Custom Template",
};

export default function WhatsAppJobsClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [retrying, setRetrying] = useState<number | null>(null);

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

  const runQueue = async () => {
    try {
      const res = await fetch("/api/cron/whatsapp-jobs");
      const data = await res.json() as { succeeded?: number; failed?: number; skipped?: number };
      alert(`Queue processed: ${data.succeeded ?? 0} succeeded, ${data.failed ?? 0} failed, ${data.skipped ?? 0} retrying`);
      load();
    } catch {
      alert("Failed to run queue");
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const filterBtns = ["", "pending", "processing", "done", "failed", "cancelled"];

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <i className="fa-solid fa-list-ul" style={{ fontSize: 24, color: "#16a34a" }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1f2937", margin: 0 }}>WhatsApp Job Queue</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0 0" }}>Monitor automated message delivery status</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {filterBtns.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              border: statusFilter === s ? "1px solid #16a34a" : "1px solid #d1d5db",
              background: statusFilter === s ? "#16a34a" : "#fff",
              color: statusFilter === s ? "#fff" : "#4b5563",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {s || "All"}
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
                        {job.status}
                      </span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>#{job.id}</span>
                    </div>

                    {job.booking && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        {job.booking.customer_name} · {job.booking.public_booking_id ?? `#${job.booking.serial}`}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>Scheduled: {new Date(job.scheduled_at).toLocaleString("en-IN")}</span>
                      <span>Attempts: {job.attempts}/{job.max_attempts}</span>
                      {job.completed_at && (
                        <span style={{ color: "#16a34a" }}>Done: {new Date(job.completed_at).toLocaleString("en-IN")}</span>
                      )}
                    </div>

                    {job.failed_reason && (
                      <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <i className="fa-solid fa-circle-exclamation" style={{ fontSize: 10 }} />
                        {job.failed_reason}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {(job.status === "failed" || job.status === "cancelled") && (
                      <button
                        onClick={() => retryJob(job.id)}
                        disabled={retrying === job.id}
                        style={{
                          fontSize: 12,
                          background: "#fffbeb",
                          color: "#d97706",
                          border: "1px solid #fde68a",
                          borderRadius: 8,
                          padding: "4px 10px",
                          cursor: retrying === job.id ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <i className="fa-solid fa-rotate-left" style={{ fontSize: 11 }} />
                        {retrying === job.id ? "Retrying..." : "Retry"}
                      </button>
                    )}
                    {job.status === "done" && (
                      <i className="fa-solid fa-circle-check" style={{ color: "#16a34a", fontSize: 18 }} />
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
