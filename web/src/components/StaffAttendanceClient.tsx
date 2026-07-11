"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { todayIso } from "@/lib/constants";
import { fetchJson } from "@/lib/fetchJson";
import { formatInr } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { SaveConfirmedBanner } from "@/components/SaveConfirmedBanner";
import { buildSaveRedirectUrl } from "@/components/SaveConfirmedBanner";

type Staff = { id: number; name: string; phone?: string | null };
type StaffUser = { id: number; username: string; role: string; staffId: number | null };
type AttSummary = { id: number; name: string; present: number; absent: number; half_day: number };
type SalEntry = { id: number; date: string; amount: number; note: string };
type SalSummary = { id: number; name: string; total: number; count: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  present: { bg: "#28a745", color: "white" },
  absent: { bg: "#dc3545", color: "white" },
  half_day: { bg: "#ffc107", color: "#333" },
  shop_closed: { bg: "#6c757d", color: "white" },
};

export default function StaffAttendanceClient({
  staffList: initialStaff,
  allUsers,
  isOwner,
  initialToday,
  saveConfirmed,
}: {
  staffList: Staff[];
  allUsers: StaffUser[];
  isOwner: boolean;
  initialToday?: string;
  saveConfirmed?: { title: string; detail?: string };
}) {
  const router = useRouter();
  const toast = useToast();

  const [staffList, setStaffList] = useState(initialStaff);
  const todayDefault = initialToday || todayIso();
  const [attDate, setAttDate] = useState(todayDefault);
  const [holidayDate, setHolidayDate] = useState(todayDefault);
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [calStaffId, setCalStaffId] = useState(String(initialStaff[0]?.id || ""));
  const [calMonth, setCalMonth] = useState(todayDefault.slice(0, 7));
  const [calendarDays, setCalendarDays] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<AttSummary[]>([]);
  const [saving, setSaving] = useState(false);

  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState("staff");

  // Salary ledger
  const [salStaffId, setSalStaffId] = useState(String(initialStaff[0]?.id || ""));
  const [salMonth, setSalMonth] = useState(todayDefault.slice(0, 7));
  const [salDate, setSalDate] = useState(todayDefault);
  const [salPayStaffId, setSalPayStaffId] = useState(String(initialStaff[0]?.id || ""));
  const [salAmount, setSalAmount] = useState("");
  const [salNote, setSalNote] = useState("");
  const [salDays, setSalDays] = useState<Record<string, number>>({});
  const [salEntries, setSalEntries] = useState<SalEntry[]>([]);
  const [salTotal, setSalTotal] = useState(0);
  const [salSummary, setSalSummary] = useState<SalSummary[]>([]);
  const [salSaving, setSalSaving] = useState(false);

  useEffect(() => {
    setStaffList(initialStaff);
  }, [initialStaff]);

  useEffect(() => {
    const init: Record<number, string> = {};
    staffList.forEach((s) => {
      init[s.id] = "present";
    });
    setStatuses(init);
  }, [staffList]);

  const loadCalendar = useCallback(async () => {
    if (!calStaffId || !calMonth) return;
    try {
      const data = await fetchJson<{ days: Record<string, string> }>(
        `/api/staff/attendance-calendar?staff_id=${calStaffId}&month=${calMonth}`,
      );
      setCalendarDays(data.days || {});
    } catch {
      setCalendarDays({});
    }
  }, [calStaffId, calMonth]);

  const loadSummary = useCallback(async () => {
    if (!calMonth) return;
    try {
      const data = await fetchJson<AttSummary[]>(`/api/staff/attendance?month=${calMonth}`);
      setSummary(data);
    } catch {
      setSummary([]);
    }
  }, [calMonth]);

  useEffect(() => {
    loadCalendar();
    loadSummary();
  }, [loadCalendar, loadSummary]);

  const loadSalaryCalendar = useCallback(async () => {
    if (!salStaffId || !salMonth) return;
    try {
      const data = await fetchJson<{ days: Record<string, number>; entries: SalEntry[]; total: number }>(
        `/api/staff/salary-calendar?staff_id=${salStaffId}&month=${salMonth}`,
      );
      setSalDays(data.days || {});
      setSalEntries(data.entries || []);
      setSalTotal(data.total || 0);
    } catch {
      setSalDays({});
      setSalEntries([]);
      setSalTotal(0);
    }
  }, [salStaffId, salMonth]);

  const loadSalarySummary = useCallback(async () => {
    if (!salMonth) return;
    try {
      const data = await fetchJson<SalSummary[]>(`/api/staff/salary?month=${salMonth}`);
      setSalSummary(data);
    } catch {
      setSalSummary([]);
    }
  }, [salMonth]);

  useEffect(() => {
    loadSalaryCalendar();
    loadSalarySummary();
  }, [loadSalaryCalendar, loadSalarySummary]);

  async function saveAttendance() {
    setSaving(true);
    try {
      await fetchJson("/api/staff/attendance/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: attDate, statuses }),
      });
      toast("Attendance saved", "success");
      loadCalendar();
      loadSummary();
      router.replace(
        buildSaveRedirectUrl("/staff-attendance", {
          title: "Attendance saved",
          detail: attDate,
        }),
      );
      window.scrollTo(0, 0);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function markShopClosed() {
    if (!confirm(`Mark shop CLOSED for ${holidayDate}? All staff will be marked shop closed.`)) return;
    setSaving(true);
    try {
      await fetchJson("/api/staff/attendance/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: holidayDate, shop_closed: true }),
      });
      toast("Shop marked closed for all staff", "info");
      loadCalendar();
      loadSummary();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveSalary(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(salAmount);
    if (!salPayStaffId) {
      toast("Select a staff member", "error");
      return;
    }
    if (!(amt > 0)) {
      toast("Enter a valid amount", "error");
      return;
    }
    setSalSaving(true);
    try {
      await fetchJson("/api/staff/salary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: salPayStaffId, date: salDate, amount: amt, note: salNote }),
      });
      toast("Salary payment recorded", "success");
      setSalAmount("");
      setSalNote("");
      // Keep the ledger view focused on whoever we just paid
      setSalStaffId(salPayStaffId);
      setSalMonth(salDate.slice(0, 7));
      loadSalaryCalendar();
      loadSalarySummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to record", "error");
    } finally {
      setSalSaving(false);
    }
  }

  async function deleteSalary(id: number) {
    if (!confirm("Remove this salary entry?")) return;
    try {
      await fetchJson(`/api/staff/salary/${id}/delete`, { method: "POST" });
      toast("Entry removed", "success");
      loadSalaryCalendar();
      loadSalarySummary();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    try {
      await fetchJson("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName,
          phone: addPhone,
          username: addUsername,
          password: addPassword,
          role: addRole,
        }),
      });
      toast("Staff added", "success");
      const staffName = addName.trim();
      setAddName("");
      setAddPhone("");
      setAddUsername("");
      setAddPassword("");
      setAddRole("staff");
      router.replace(
        buildSaveRedirectUrl("/staff-attendance", {
          title: "Staff saved",
          detail: staffName,
        }),
      );
      router.refresh();
      window.scrollTo(0, 0);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to add staff", "error");
    }
  }

  async function removeStaff(id: number, name: string) {
    if (!confirm(`Remove ${name}? Their login will be deactivated.`)) return;
    try {
      await fetchJson(`/api/staff/${id}`, { method: "POST" });
      toast("Staff removed", "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  function userForStaff(staffId: number) {
    return allUsers.find((u) => u.staffId === staffId);
  }

  function renderCalendar() {
    const [year, month] = calMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: React.ReactNode[] = [];

    WEEKDAYS.forEach((d) => {
      cells.push(
        <div key={`h-${d}`} style={{ fontWeight: 700, padding: 6, color: "var(--text-muted)" }}>
          {d}
        </div>,
      );
    });

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`e-${i}`} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const status = calendarDays[dateStr] || "";
      const colors = STATUS_COLORS[status] || { bg: "#f8f9fa", color: "#333" };
      cells.push(
        <div
          key={dateStr}
          title={status || "No record"}
          style={{
            padding: "8px 4px",
            background: colors.bg,
            color: colors.color,
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {d}
        </div>,
      );
    }

    return cells;
  }

  function renderSalaryCalendar() {
    const [year, month] = salMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: React.ReactNode[] = [];

    WEEKDAYS.forEach((d) => {
      cells.push(
        <div key={`sh-${d}`} style={{ fontWeight: 700, padding: 6, color: "var(--text-muted)" }}>
          {d}
        </div>,
      );
    });

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`se-${i}`} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const amt = salDays[dateStr] || 0;
      const has = amt > 0;
      cells.push(
        <div
          key={dateStr}
          title={has ? `Paid ₹${formatInr(amt)}` : "No payment"}
          style={{
            padding: "6px 3px",
            background: has ? "#0d6efd" : "#f8f9fa",
            color: has ? "white" : "#333",
            borderRadius: 6,
            fontWeight: 600,
            minHeight: 42,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <span>{d}</span>
          {has && <span style={{ fontSize: 9.5, fontWeight: 700, lineHeight: 1 }}>₹{formatInr(amt)}</span>}
        </div>,
      );
    }

    return cells;
  }

  const salStaffName = staffList.find((s) => String(s.id) === salStaffId)?.name || "";

  return (
    <>
      {saveConfirmed && (
        <SaveConfirmedBanner
          title={saveConfirmed.title}
          detail={saveConfirmed.detail}
          hint="Continue with the next entry below."
        />
      )}
    <div className="two-col" style={{ gap: 20, gridTemplateColumns: "1fr 2fr" }}>
      {/* Left column */}
      <div>
        {isOwner && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">
                <i className="fa-solid fa-user-plus" style={{ marginRight: 8 }} />
                Add Staff
              </h3>
            </div>
            <div className="card-body">
              <form onSubmit={addStaff}>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-control" value={addName} onChange={(e) => setAddName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-control" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
                </div>
                <hr style={{ borderColor: "var(--border)", margin: "12px 0" }} />
                <div style={{ fontSize: 11, color: "var(--gold-dark)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  <i className="fa-solid fa-key" /> Login Account (optional)
                </div>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input className="form-control" value={addUsername} onChange={(e) => setAddUsername(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input type="password" className="form-control" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-control" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                    <option value="staff">Staff</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="submit" className="btn btn-primary btn-sm">
                    <i className="fa-solid fa-save" /> Add Staff
                  </button>
                  <Link href="/users" className="btn btn-outline btn-sm">
                    <i className="fa-solid fa-users-gear" /> Manage Users
                  </Link>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-clipboard-check" style={{ marginRight: 8 }} />
              Mark Attendance
            </h3>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input type="date" className="form-control" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
            </div>
            {staffList.length ? (
              <>
                {staffList.map((s) => (
                  <div
                    key={s.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}
                  >
                    <strong style={{ flex: 1, fontSize: 13, minWidth: 0 }}>{s.name}</strong>
                    <select
                      className="form-control"
                      style={{ width: 120, fontSize: 12, flexShrink: 0 }}
                      value={statuses[s.id] || "present"}
                      onChange={(e) => setStatuses({ ...statuses, [s.id]: e.target.value })}
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </div>
                ))}
                <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={saveAttendance} disabled={saving}>
                  <i className="fa-solid fa-save" /> Save
                </button>
              </>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No active staff. Add staff first.</p>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">
                <i className="fa-solid fa-money-bill-wave" style={{ marginRight: 8 }} />
                Record Salary Payment
              </h3>
            </div>
            <div className="card-body">
              {staffList.length ? (
                <form onSubmit={saveSalary}>
                  <div className="form-group">
                    <label className="form-label">Staff *</label>
                    <select
                      className="form-control"
                      value={salPayStaffId}
                      onChange={(e) => setSalPayStaffId(e.target.value)}
                    >
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date *</label>
                    <input type="date" className="form-control" value={salDate} onChange={(e) => setSalDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount (₹) *</label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      inputMode="decimal"
                      className="form-control"
                      placeholder="e.g. 500"
                      value={salAmount}
                      onChange={(e) => setSalAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Note (optional)</label>
                    <input
                      className="form-control"
                      placeholder="e.g. advance, weekly salary"
                      value={salNote}
                      onChange={(e) => setSalNote(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={salSaving}>
                    <i className="fa-solid fa-plus" /> Add Payment
                  </button>
                </form>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: 12 }}>No active staff. Add staff first.</p>
              )}
            </div>
          </div>
        )}

        {isOwner && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="fa-solid fa-store-slash" style={{ marginRight: 8 }} />
                Mark Holiday
              </h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input type="date" className="form-control" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
              </div>
              <button type="button" className="btn btn-sm" style={{ background: "#6c757d", color: "white" }} onClick={markShopClosed} disabled={saving}>
                <i className="fa-solid fa-store-slash" /> Mark Shop Closed
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right column */}
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-calendar" style={{ marginRight: 8 }} />
              Attendance Calendar
            </h3>
            <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="form-control"
                style={{ width: 150, fontSize: 12 }}
                value={calStaffId}
                onChange={(e) => setCalStaffId(e.target.value)}
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="month"
                className="form-control"
                style={{ width: 160 }}
                value={calMonth}
                onChange={(e) => setCalMonth(e.target.value)}
              />
              <button type="button" onClick={() => window.print()} className="btn btn-outline btn-sm">
                <i className="fa-solid fa-print" />
              </button>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", fontSize: 12 }}>
              {renderCalendar()}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 11, flexWrap: "wrap" }}>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#28a745", borderRadius: 3, marginRight: 4 }} />Present</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#dc3545", borderRadius: 3, marginRight: 4 }} />Absent</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#ffc107", borderRadius: 3, marginRight: 4 }} />Half Day</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: "#6c757d", borderRadius: 3, marginRight: 4 }} />Shop Closed</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-chart-bar" style={{ marginRight: 8 }} />
              Monthly Summary
            </h3>
          </div>
          <div className="card-body">
            {summary.length ? (
              <div className="table-wrapper">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Half Day</th>
                      <th>Total Working</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s) => (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong></td>
                        <td style={{ color: "#28a745" }}>{s.present}</td>
                        <td style={{ color: "#dc3545" }}>{s.absent}</td>
                        <td style={{ color: "#ffc107" }}>{s.half_day}</td>
                        <td>{s.present + s.half_day * 0.5}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No attendance data.</p>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-money-check-dollar" style={{ marginRight: 8 }} />
              Salary Ledger
            </h3>
            <div className="no-print" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="form-control"
                style={{ width: 150, fontSize: 12 }}
                value={salStaffId}
                onChange={(e) => setSalStaffId(e.target.value)}
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="month"
                className="form-control"
                style={{ width: 160 }}
                value={salMonth}
                onChange={(e) => setSalMonth(e.target.value)}
              />
              <button type="button" onClick={() => window.print()} className="btn btn-outline btn-sm">
                <i className="fa-solid fa-print" />
              </button>
            </div>
          </div>
          <div className="card-body">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
                padding: "12px 16px",
                marginBottom: 14,
                background: "#e7f1ff",
                border: "1px solid #b6d4fe",
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 13, color: "#084298" }}>
                Total paid to <strong>{salStaffName || "—"}</strong> this month
                {salEntries.length > 0 && (
                  <span style={{ color: "#6c757d" }}> · {salEntries.length} payment{salEntries.length > 1 ? "s" : ""}</span>
                )}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0d6efd" }}>₹{formatInr(salTotal)}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", fontSize: 12 }}>
              {renderSalaryCalendar()}
            </div>

            {salEntries.length > 0 ? (
              <div className="table-wrapper" style={{ marginTop: 14 }}>
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Note</th>
                      {isOwner && <th className="no-print" />}
                    </tr>
                  </thead>
                  <tbody>
                    {salEntries.map((en) => (
                      <tr key={en.id}>
                        <td>{en.date}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#0d6efd" }}>₹{formatInr(en.amount)}</td>
                        <td style={{ color: "var(--text-muted)" }}>{en.note || "—"}</td>
                        {isOwner && (
                          <td className="no-print" style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: 10, padding: "3px 8px" }}
                              onClick={() => deleteSalary(en.id)}
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 700 }}>Total</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#0d6efd" }}>₹{formatInr(salTotal)}</td>
                      <td colSpan={isOwner ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 14 }}>
                No salary payments recorded for {salStaffName || "this staff"} this month.
              </p>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h3 className="card-title">
              <i className="fa-solid fa-sack-dollar" style={{ marginRight: 8 }} />
              Monthly Salary Summary
            </h3>
          </div>
          <div className="card-body">
            {salSummary.some((s) => s.count > 0) ? (
              <div className="table-wrapper">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th style={{ textAlign: "right" }}>Payments</th>
                      <th style={{ textAlign: "right" }}>Total Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salSummary.map((s) => (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong></td>
                        <td style={{ textAlign: "right" }}>{s.count}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "#0d6efd" }}>₹{formatInr(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ fontWeight: 700 }}>All Staff</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{salSummary.reduce((a, s) => a + s.count, 0)}</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: "#0d6efd" }}>
                        ₹{formatInr(salSummary.reduce((a, s) => a + s.total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>No salary payments this month.</p>
            )}
          </div>
        </div>

        {staffList.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <h3 className="card-title">
                <i className="fa-solid fa-users" style={{ marginRight: 8 }} />
                Active Staff
              </h3>
            </div>
            <div className="card-body p-0">
              <div className="table-wrapper">
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      {isOwner && <th className="no-print">Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((s) => {
                      const linked = userForStaff(s.id);
                      return (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.name}</strong>
                            {linked && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "2px 8px",
                                  borderRadius: 12,
                                  marginLeft: 6,
                                  background: linked.role === "owner" ? "#d4af3722" : "var(--cream-dark)",
                                  color: linked.role === "owner" ? "#9E7F28" : "var(--text-muted)",
                                }}
                              >
                                {linked.role === "owner" ? (
                                  <><i className="fa-solid fa-crown" /> Owner</>
                                ) : (
                                  <><i className="fa-solid fa-user" /> Staff</>
                                )}{" "}
                                ({linked.username})
                              </span>
                            )}
                          </td>
                          <td>{s.phone || "—"}</td>
                          {isOwner && (
                            <td className="no-print">
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{ fontSize: 10, padding: "3px 8px" }}
                                onClick={() => removeStaff(s.id, s.name)}
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
