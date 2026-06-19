"use client";

import { useState } from "react";

type BookingRow = {
  id: number;
  serial: number;
  customer_name: string;
  contact_1: string;
  delivery_date: string;
  delivery_time: string;
  return_date: string;
  status: string;
  total_price: number;
  venue: string;
  items: { name: string; display_name?: string }[];
};

export default function SearchBookingClient() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function doSearch() {
    const res = await fetch(
      `/api/search-booking?date=${date}&q=${encodeURIComponent(query.trim())}`
    );
    const data = await res.json();
    setRows(data);
    setLoaded(true);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 16, alignItems: "end" }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Date (Month Reference)</label>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Search (Serial / Name / Phone / Dress)</label>
              <input
                type="text"
                className="form-input dress-name-suggest"
                placeholder="Type to search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={doSearch}>
              <i className="fa-solid fa-search" /> Search
            </button>
          </div>
        </div>
      </div>
      {loaded && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Results</h3>
            <span className="badge badge-info">{rows.length}</span>
          </div>
          <div className="card-body p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Delivery</th>
                  <th>Return</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{String(b.serial).padStart(2, "0")}</strong>
                      </td>
                      <td>{b.customer_name}</td>
                      <td>{b.contact_1}</td>
                      <td>
                        {b.delivery_date}
                        <br />
                        <small>{b.delivery_time}</small>
                      </td>
                      <td>{b.return_date}</td>
                      <td>{b.items.map((i) => i.display_name || i.name).join(", ")}</td>
                      <td>
                        <span className={`badge badge-${b.status}`}>{b.status}</span>
                      </td>
                      <td>
                        <a href={`/booking/${b.id}/edit`} className="btn btn-sm btn-primary">
                          Edit
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 20 }}>
                      No bookings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
