import { formatInr } from "@/lib/format";
import { categoryLabelKeys, numberMap, numberValue } from "@/lib/finance/safeNumbers";

export function FinanceCategorySaleTable({
  advanceByCategory,
  balanceByCategory = {},
  bookingCounts = {},
  dressCounts = {},
  deliveredCounts = {},
  title = "Category Breakdown",
  showTotalSale = true,
}: {
  advanceByCategory: Record<string, number> | null | undefined;
  balanceByCategory?: Record<string, number> | null | undefined;
  bookingCounts?: Record<string, number> | null | undefined;
  dressCounts?: Record<string, number> | null | undefined;
  deliveredCounts?: Record<string, number> | null | undefined;
  title?: string;
  showTotalSale?: boolean;
}) {
  const advance = numberMap(advanceByCategory);
  const balance = numberMap(balanceByCategory);
  const bookings = numberMap(bookingCounts);
  const dresses = numberMap(dressCounts);
  const delivered = numberMap(deliveredCounts);
  const labels = categoryLabelKeys(advance, balance, bookings, dresses, delivered);
  if (labels.length === 0) return null;

  const totalAdvance = labels.reduce((s, c) => s + numberValue(advance[c]), 0);
  const totalBalance = labels.reduce((s, c) => s + numberValue(balance[c]), 0);
  const totalBookings = labels.reduce((s, c) => s + numberValue(bookings[c]), 0);
  const totalDresses = labels.reduce((s, c) => s + numberValue(dresses[c]), 0);
  const totalDelivered = labels.reduce((s, c) => s + numberValue(delivered[c]), 0);
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
            const advanceAmt = numberValue(advance[cat]);
            const balanceAmt = numberValue(balance[cat]);
            return (
              <tr key={cat}>
                <td>{cat}</td>
                <td>₹{formatInr(advanceAmt)}</td>
                <td>₹{formatInr(balanceAmt)}</td>
                <td><strong>{numberValue(bookings[cat])}</strong></td>
                <td><strong>{numberValue(dresses[cat])}</strong></td>
                <td><strong>{numberValue(delivered[cat])}</strong></td>
                {showTotalSale && <td><strong>₹{formatInr(advanceAmt + balanceAmt)}</strong></td>}
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
