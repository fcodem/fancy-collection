import { formatInr } from "@/lib/format";

export function FinanceCategorySaleTable({
  advanceByCategory,
  balanceByCategory = {},
  bookingCounts = {},
  dressCounts = {},
  deliveredCounts = {},
  title = "Category Breakdown",
  showTotalSale = true,
}: {
  advanceByCategory: Record<string, number>;
  balanceByCategory?: Record<string, number>;
  bookingCounts?: Record<string, number>;
  dressCounts?: Record<string, number>;
  deliveredCounts?: Record<string, number>;
  title?: string;
  showTotalSale?: boolean;
}) {
  const labels = [
    ...new Set([
      ...Object.keys(advanceByCategory),
      ...Object.keys(balanceByCategory),
      ...Object.keys(bookingCounts),
      ...Object.keys(dressCounts),
      ...Object.keys(deliveredCounts),
    ]),
  ].sort();
  if (labels.length === 0) return null;

  const totalAdvance = labels.reduce((s, c) => s + (advanceByCategory[c] || 0), 0);
  const totalBalance = labels.reduce((s, c) => s + (balanceByCategory[c] || 0), 0);
  const totalBookings = labels.reduce((s, c) => s + (bookingCounts[c] || 0), 0);
  const totalDresses = labels.reduce((s, c) => s + (dressCounts[c] || 0), 0);
  const totalDelivered = labels.reduce((s, c) => s + (deliveredCounts[c] || 0), 0);
  const totalSale = totalAdvance + totalBalance;

  return (
    <div style={{ marginTop: 24 }}>
      <h4 style={{ marginBottom: 12, fontSize: 16 }}>{title}</h4>
      <table className="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Advance Received</th>
            <th>Balance Received</th>
            <th>New Bookings</th>
            <th>Dresses Booked</th>
            <th>Delivered</th>
            {showTotalSale && <th>Total Sale</th>}
          </tr>
        </thead>
        <tbody>
          {labels.map((cat) => {
            const advance = advanceByCategory[cat] || 0;
            const balance = balanceByCategory[cat] || 0;
            return (
              <tr key={cat}>
                <td>{cat}</td>
                <td>₹{formatInr(advance)}</td>
                <td>₹{formatInr(balance)}</td>
                <td><strong>{bookingCounts[cat] ?? 0}</strong></td>
                <td><strong>{dressCounts[cat] ?? 0}</strong></td>
                <td><strong>{deliveredCounts[cat] ?? 0}</strong></td>
                {showTotalSale && <td><strong>₹{formatInr(advance + balance)}</strong></td>}
              </tr>
            );
          })}
          <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border)" }}>
            <td>Total</td>
            <td>₹{formatInr(totalAdvance)}</td>
            <td>₹{formatInr(totalBalance)}</td>
            <td>{totalBookings}</td>
            <td>{totalDresses}</td>
            <td>{totalDelivered}</td>
            {showTotalSale && <td>₹{formatInr(totalSale)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
