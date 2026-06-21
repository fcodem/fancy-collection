"use client";

import { useState } from "react";
import Link from "next/link";

async function downloadFile(url: string, label: string, setDownloading: (v: string | null) => void) {
  setDownloading(label);
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Download failed — you may not have permission.");
      return;
    }
    const blob = await res.blob();
    const cd = res.headers.get("content-disposition") || "";
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : "download";
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch {
    alert("Download failed. Please try again.");
  } finally {
    setDownloading(null);
  }
}

type CardAction = { label: string; url: string; primary?: boolean; icon?: string };

function DownloadCard({
  icon, color, title, description, actions, downloading, onDownload,
}: {
  icon: string;
  color: string;
  title: string;
  description: string;
  actions: CardAction[];
  downloading: string | null;
  onDownload: (url: string, label: string) => void;
}) {
  return (
    <div className="card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 9, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className={`fa-solid ${icon}`} style={{ color: "white", fontSize: 16 }} />
          </span>
          <h3 className="card-title" style={{ margin: 0 }}>{title}</h3>
        </div>
      </div>
      <div className="card-body" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, flex: 1 }}>{description}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {actions.map((a) => (
            <button
              key={a.url}
              className={`btn ${a.primary ? "btn-primary" : "btn-outline"}`}
              disabled={downloading !== null}
              onClick={() => onDownload(a.url, a.label)}
            >
              {downloading === a.label
                ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />Generating…</>
                : <><i className={`fa-solid ${a.icon || "fa-download"}`} style={{ marginRight: 8 }} />{a.label}</>
              }
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, iconColor, title, sub }: { icon: string; iconColor: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 18, marginTop: 8 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <i className={`fa-solid ${icon}`} style={{ color: iconColor }} />
        {title}
      </h3>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{sub}</p>
    </div>
  );
}

export default function ReportsClient({ isOwner = false }: { isOwner?: boolean }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  function dl(url: string, label: string) {
    downloadFile(url, label, setDownloading);
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)", marginBottom: 6 }}>
          <i className="fa-solid fa-file-export" style={{ marginRight: 10 }} />
          Reports &amp; Backup
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Download Word reports for bookings, CSV exports for Excel, and full data backups for safety.
          <strong style={{ color: "var(--primary)", marginLeft: 6 }}>Recommended: Take a full backup every day.</strong>
        </p>
      </div>

      {/* ── Word Reports ── */}
      <SectionTitle
        icon="fa-file-word"
        iconColor="#1565c0"
        title="Word Reports (DOCX)"
        sub="Formatted tables ready to print. Open in Microsoft Word or Google Docs."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 18, marginBottom: 32 }}>
        <DownloadCard
          icon="fa-table-list"
          color="var(--primary)"
          title="All Bookings"
          description="Complete list of all active bookings — customer details, dress names, delivery & return dates, rent, advance, remaining balance, and status."
          actions={[{ label: "Download All Bookings (.docx)", url: "/api/admin/reports?type=all", primary: true, icon: "fa-file-word" }]}
          downloading={downloading}
          onDownload={dl}
        />
        <DownloadCard
          icon="fa-circle-check"
          color="var(--success)"
          title="Delivered Bookings"
          description="All bookings currently marked as Delivered — dresses that are out with customers right now. Use for daily tracking."
          actions={[{ label: "Download Delivered Report (.docx)", url: "/api/admin/reports?type=delivered", primary: true, icon: "fa-file-word" }]}
          downloading={downloading}
          onDownload={dl}
        />
        <DownloadCard
          icon="fa-truck-fast"
          color="#E65100"
          title="Upcoming Deliveries"
          description="All booked orders scheduled for delivery from today onwards, sorted by delivery date. Perfect for daily delivery planning."
          actions={[{ label: "Download Upcoming Deliveries (.docx)", url: "/api/admin/reports?type=upcoming", primary: true, icon: "fa-file-word" }]}
          downloading={downloading}
          onDownload={dl}
        />
      </div>

      {/* ── CSV Exports ── */}
      <SectionTitle
        icon="fa-file-csv"
        iconColor="var(--success)"
        title="CSV Exports (Excel)"
        sub="Raw data exports that open directly in Microsoft Excel or Google Sheets."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 18, marginBottom: 32 }}>
        <DownloadCard
          icon="fa-calendar-check"
          color="var(--primary)"
          title="Bookings CSV"
          description="All booking records as a spreadsheet — dates, customers, payments, and status. Open in Excel."
          actions={[{ label: "Download Bookings CSV", url: "/api/admin/export/bookings", icon: "fa-file-csv" }]}
          downloading={downloading}
          onDownload={dl}
        />
        <DownloadCard
          icon="fa-shirt"
          color="#6A1B9A"
          title="Inventory CSV"
          description="Full dress inventory export — SKU, name, category, size, color, status, and pricing."
          actions={[{ label: "Download Inventory CSV", url: "/api/admin/export/inventory", icon: "fa-file-csv" }]}
          downloading={downloading}
          onDownload={dl}
        />
      </div>

      {/* ── Full Backup (Owner only) ── */}
      {!isOwner && (
        <div className="card" style={{ background: "var(--cream-dark)", marginBottom: 32 }}>
          <div className="card-body" style={{ textAlign: "center", padding: 32 }}>
            <i className="fa-solid fa-lock" style={{ fontSize: 28, color: "var(--text-muted)", marginBottom: 12 }} />
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
              Full data backup and CSV exports are available to <strong>Owner</strong> accounts only.
            </p>
          </div>
        </div>
      )}
      {isOwner && <><SectionTitle
        icon="fa-database"
        iconColor="#C62828"
        title="Full Data Backup (JSON)"
        sub="Downloads every single record stored in this website — bookings, inventory, customers, staff, and all other data."
      />

      <div className="card" style={{ borderLeft: "4px solid #C62828", marginBottom: 32 }}>
        <div className="card-body">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 24 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "var(--primary)" }}>
                <i className="fa-solid fa-shield-halved" style={{ marginRight: 8, color: "#C62828" }} />
                Complete System Backup
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                Downloads a <code style={{ background: "var(--cream-dark)", padding: "1px 6px", borderRadius: 4 }}>.json</code> file containing <strong>every record</strong> in the system:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", fontSize: 13, color: "var(--text-muted)" }}>
                {[
                  "All Bookings & Items",
                  "Complete Inventory",
                  "Customers & Staff",
                  "Users & Categories",
                  "Attendance & Suppliers",
                  "Rentals, Invoices & Payments",
                  "Prospect Leads & Enquiries",
                  "Activity Log (audit trail)",
                ].map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <i className="fa-solid fa-check" style={{ color: "var(--success)", fontSize: 11 }} />
                    {item}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, marginBottom: 0 }}>
                <i className="fa-solid fa-image" style={{ marginRight: 6 }} />
                Dress photos and ID images are stored as file paths. Also copy <code>public/uploads/</code> or use{" "}
                <Link href="/admin/image-sync" style={{ fontWeight: 600 }}>Bulk Image Sync</Link> after restore.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 230 }}>
              <button
                className="btn btn-primary"
                style={{ background: "#C62828", border: "none", padding: "13px 24px", fontWeight: 700, fontSize: 14 }}
                disabled={downloading !== null}
                onClick={() => dl("/api/admin/backup", "Full Backup")}
              >
                {downloading === "Full Backup"
                  ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />Generating…</>
                  : <><i className="fa-solid fa-database" style={{ marginRight: 8 }} />Download Full Backup</>
                }
              </button>
              <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                <i className="fa-solid fa-circle-info" style={{ marginRight: 5 }} />
                File: <code>fancy-collection-backup-YYYY-MM-DD.json</code>
                <br />
                <i className="fa-solid fa-clock" style={{ marginRight: 5 }} />
                Recommended: download daily and store on USB or Google Drive.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Restore from Backup */}
      <div className="card" style={{ borderLeft: "4px solid var(--primary)", marginBottom: 32 }}>
        <div className="card-body" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: "var(--primary)" }}>
              <i className="fa-solid fa-upload" style={{ marginRight: 8 }} />
              Restore Database from Backup
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Upload a previously downloaded <code>.json</code> backup file to restore all data.
              This replaces all existing data with the backup contents.
            </p>
          </div>
          <a href="/admin/restore" className="btn btn-primary" style={{ fontWeight: 700, padding: "10px 24px" }}>
            <i className="fa-solid fa-upload" style={{ marginRight: 8 }} />
            Go to Restore Page
          </a>
        </div>
      </div>

      {/* Restore Instructions */}
      <div className="card" style={{ background: "var(--cream-dark)" }}>
        <div className="card-body">
          <h4 style={{ marginBottom: 14, color: "var(--primary)", fontSize: 14 }}>
            <i className="fa-solid fa-rotate-left" style={{ marginRight: 8 }} />
            How to Restore Data from Backup
          </h4>
          <ol style={{ fontSize: 13, color: "var(--text-muted)", paddingLeft: 20, lineHeight: 2.2, margin: 0 }}>
            <li>Keep the <strong>.json backup file</strong> safe — save on USB drive, email it to yourself, or upload to Google Drive.</li>
            <li>On a new computer or server, install this website fresh.</li>
            <li>Go to <strong>Admin → Restore Database</strong> and upload the <code>.json</code> backup file.</li>
            <li>The system will preview the file contents, then restore everything in a single transaction.</li>
            <li>The <strong>Bookings CSV</strong> and <strong>Inventory CSV</strong> can also be opened in Excel without the website.</li>
            <li>After restore, copy your <strong>uploads folder</strong> back or re-sync dress photos via Bulk Image Sync.</li>
          </ol>
        </div>
      </div>
      </>}
    </div>
  );
}
