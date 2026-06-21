"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StandardBookingTableCells, StandardBookingTableHead } from "@/components/BookingDetailsColumns";
import type { StandardBookingDetails } from "@/lib/bookingDetails";

type RecycleRow = StandardBookingDetails & {
  id: number;
  serial: number;
  items: Array<{ display_name: string }>;
};

export default function RecycleBinClient() {
  const router = useRouter();
  const [rows, setRows] = useState<RecycleRow[]>([]);

  useEffect(() => {
    fetch("/api/recycle-bin").then((r) => r.json()).then(setRows).catch(() => {});
  }, []);

  async function restore(id: number) {
    await fetch(`/api/recycle-bin/${id}/restore`, { method: "POST" });
    router.refresh();
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function del(id: number) {
    if (!confirm("Permanently delete this booking?")) return;
    await fetch(`/api/recycle-bin/${id}`, { method: "DELETE" });
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Recycle Bin</h3></div>
      <div className="card-body p-0">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>S.No</th>
                <StandardBookingTableHead />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{String(b.serial).padStart(2, "0")}</td>
                  <StandardBookingTableCells d={b} />
                  <td>
                    <button className="btn btn-sm btn-primary" style={{ marginRight: 8 }} onClick={() => restore(b.id)}>Restore</button>
                    <button className="btn btn-sm btn-outline" onClick={() => del(b.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
