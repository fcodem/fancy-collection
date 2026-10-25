import { redirect } from "next/navigation";
import { getCurrentUserForLayout } from "@/lib/auth";
import { formatDate, todayIso } from "@/lib/constants";
import { addDaysIso } from "@/lib/dateInput";
import { formatInr } from "@/lib/format";
import { getAllCategories, getCategoryDivisionLists } from "@/lib/categories";
import { getPackingListPage } from "@/lib/services/packingList";
import {
  PACKING_DIVISIONS,
  formatPackingCategoryFilterLabel,
  packingDivisionFilterValue,
  parsePackingDivisionFilter,
} from "@/lib/packingDivision";
import { packingSectionsForRows } from "@/lib/packingListSections";
import PrintPaginator, { type PrintBlock } from "@/components/print/PrintPaginator";
import { PRINT_CSS } from "../[kind]/PrintRecordCard";
import PackingPrintFilters from "./PackingPrintFilters";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

type PackingRow = Awaited<ReturnType<typeof getPackingListPage>>["results"][number];

const PACKING_CSS = `
  .pk-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; border: 1.5px solid #000; padding: 8px 10px; margin-bottom: 12px; }
  .pk-filters label { display: flex; flex-direction: column; font-size: 11px; font-weight: 800; text-transform: uppercase; gap: 3px; }
  .pk-filters input, .pk-filters select { font-size: 13px; padding: 5px 8px; border: 1.5px solid #000; border-radius: 4px; background: #fff; color: #000; min-width: 150px; }
  .pk-section-h { background: #000 !important; color: #fff !important; padding: 4px 10px; margin: 2px 0 5px; font-size: 15px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; display: flex; justify-content: space-between; }
  .pk-section-h * { color: #fff !important; }
  .pk-bk { border: 1.5px solid #000; margin-bottom: 5px; }
  .pk-bk-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 2px 7px; background: #e6e6e6 !important; border-bottom: 1.5px solid #000; font-size: 11px; }
  .pk-bk-head .name { font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .pk-bk-meta { display: flex; gap: 14px; flex-wrap: wrap; padding: 2px 7px; font-size: 10.5px; border-bottom: 1px solid #000; }
  .pk-bk-meta b { font-size: 8.5px; text-transform: uppercase; margin-right: 3px; }
  .pk-bk .bw-table { font-size: 10.5px; }
  .pk-bk .bw-table th, .pk-bk .bw-table td { border-left: none; border-right: 1px solid #000; }
  .pk-bk .bw-table tr > :last-child { border-right: none; }
  .pk-box { display: inline-block; width: 12px; height: 12px; border: 1.5px solid #000; vertical-align: middle; }
  .pk-note { display: flex; gap: 6px; align-items: baseline; padding: 3px 7px; font-size: 11.5px; font-weight: 700; border-bottom: 2px solid #000; background: #f2f2f2 !important; overflow-wrap: anywhere; }
  .pk-note-l { flex: none; background: #000 !important; color: #fff !important; font-size: 8.5px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; padding: 1px 5px; }
  .pk-dress-note { font-weight: 700; }
  @media print { .pk-filters { display: none !important; } }
`;

function SectionHeading({ label, right }: { label: string; right: string }) {
  return (
    <div className="pk-section-h">
      <span>{label}</span>
      <span style={{ fontSize: 12 }}>{right}</span>
    </div>
  );
}

function PackingBookingCard({ b }: { b: PackingRow }) {
  return (
    <div className="pk-bk">
      <div className="pk-bk-head">
        <span className="name">
          #{String(b.serial_no).padStart(2, "0")} · {b.customer_name}
          {(b.total_fitting_charges ?? 0) > 0 && <span className="bw-tag">✂ Fitting / alteration</span>}
        </span>
        <span style={{ fontWeight: 800 }}>
          DELIVERY: {b.delivery_date} {b.delivery_time}
        </span>
      </div>
      <div className="pk-bk-meta">
        <span><b>Contact:</b>{b.contact_1 || "—"}</span>
        {b.venue && <span><b>Venue:</b>{b.venue}</span>}
        <span><b>Return:</b>{b.return_date} {b.return_time}</span>
        {b.staff_names && <span><b>Staff:</b>{b.staff_names}</span>}
      </div>
      {b.common_notes?.trim() && (
        <div className="pk-note">
          <span className="pk-note-l">Common note</span>
          <span>{b.common_notes.trim()}</span>
        </div>
      )}
      <table className="bw-table">
        <thead>
          <tr>
            <th style={{ width: 16 }}>#</th>
            <th>Dress</th>
            <th>Category</th>
            <th>Size</th>
            <th>Dress note</th>
            <th>Packing note</th>
            <th>Prepared</th>
            <th>Checked</th>
            <th style={{ width: 38, textAlign: "center" }}>Ready</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((it, i) => (
            <tr key={`${it.bi_id ?? "legacy"}-${i}`}>
              <td>{i + 1}</td>
              <td style={{ fontWeight: 700 }}>
                {it.display_name || it.dress_name}
                {it.fitting_charges > 0 && (
                  <span className="bw-tag">✂ Fitting ₹{formatInr(it.fitting_charges)} · alter</span>
                )}
              </td>
              <td>{it.category || "—"}</td>
              <td>{it.size || "—"}</td>
              <td className={it.dress_note ? "pk-dress-note" : undefined}>{it.dress_note || "—"}</td>
              <td>{it.packing_note || ""}</td>
              <td>{it.prepared_by || ""}</td>
              <td>{it.checked_by || ""}</td>
              <td style={{ textAlign: "center", fontWeight: 800 }}>
                {it.is_packed_ready ? "✔" : <span className="pk-box" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersCard({ b }: { b: PackingRow }) {
  return (
    <div className="pk-bk">
      <div className="pk-bk-head">
        <span className="name">#{String(b.serial_no).padStart(2, "0")} · {b.customer_name}</span>
        <span style={{ fontWeight: 800 }}>DELIVERY: {b.delivery_date} {b.delivery_time}</span>
      </div>
      <table className="bw-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Due</th>
            <th className="num">Cost</th>
            <th style={{ width: 38, textAlign: "center" }}>Ready</th>
          </tr>
        </thead>
        <tbody>
          {b.orders.map((o, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 700 }}>{o.description}</td>
              <td>{o.deliveryDate} {o.deliveryTime}</td>
              <td className="num">{o.cost > 0 ? `₹${formatInr(o.cost)}` : "Included"}</td>
              <td style={{ textAlign: "center" }}><span className="pk-box" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PackingPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string; autoprint?: string }>;
}) {
  const user = await getCurrentUserForLayout();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const today = todayIso();
  const from = sp.from && ISO_RE.test(sp.from) ? sp.from : today;
  const toRaw = sp.to && ISO_RE.test(sp.to) ? sp.to : addDaysIso(today, 1);
  const to = toRaw < from ? from : toRaw;
  const category = (sp.category || "").trim();
  const division = parsePackingDivisionFilter(category);

  const [page, categoryLists, allCats] = await Promise.all([
    getPackingListPage({ deliveryFrom: from, deliveryTo: to, category, limit: 2000 }),
    getCategoryDivisionLists(),
    getAllCategories(),
  ]);
  const rows = page.results as PackingRow[];
  const visibleDivisions = division ? PACKING_DIVISIONS.filter((d) => d.key === division) : PACKING_DIVISIONS;
  const sections = packingSectionsForRows(rows, categoryLists, visibleDivisions).filter((s) => s.rows.length);
  const ordersRows = rows.filter((b) => b.orders.length > 0);
  const dressesIn = (list: PackingRow[]) => list.reduce((n, b) => n + b.items.length, 0);
  const totalDresses = sections.reduce((s, sec) => s + dressesIn(sec.rows), 0);

  const groups: Array<{ label: string; names: readonly string[] }> = [
    { label: "Men's categories", names: allCats.mens_categories },
    { label: "Women's categories", names: allCats.womens_categories },
    { label: "Jewellery categories", names: allCats.jewellery_categories },
    { label: "Accessories", names: allCats.accessory_categories || [] },
    { label: "Other", names: (allCats.other_categories || []).filter((n) => n !== "Other") },
  ].filter((g) => g.names.length);

  const rangeLabel =
    from === to
      ? formatDate(from, "display")
      : `${formatDate(from, "display")} to ${formatDate(to, "display")}`;
  const filterLabel = category ? formatPackingCategoryFilterLabel(category) : "All categories";

  const blocks: PrintBlock[] = [
    {
      key: `head-${from}-${to}-${category}`,
      node: (
        <>
          <div className="bw-title">
            <div>
              <h1>Packing list</h1>
              <div className="sub">Delivery {rangeLabel} · {filterLabel}</div>
            </div>
            <div style={{ fontSize: 10, textAlign: "right" }}>
              Printed {formatDate(today, "display")}{" "}
              {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}{" "}
              by {user.username}
            </div>
          </div>
          <div className="bw-summary">
            <div>Bookings<strong>{rows.length}</strong></div>
            <div>Dresses<strong>{totalDresses}</strong></div>
            {PACKING_DIVISIONS.map((d) => {
              const sec = sections.find((s) => s.division.key === d.key);
              return (
                <div key={d.key}>
                  {d.label}
                  <strong>{sec ? dressesIn(sec.rows) : 0}</strong>
                </div>
              );
            })}
          </div>
        </>
      ),
    },
  ];

  if (sections.length === 0 && ordersRows.length === 0) {
    blocks.push({
      key: "empty",
      node: (
        <p style={{ fontSize: 14, fontWeight: 700, border: "2px solid #000", padding: 12, textAlign: "center" }}>
          No dresses to pack for this date and category.
        </p>
      ),
    });
  }

  for (const sec of sections) {
    blocks.push({
      key: `sec-${sec.division.key}`,
      keepWithNext: true,
      node: (
        <SectionHeading
          label={sec.division.label}
          right={`${sec.rows.length} booking${sec.rows.length === 1 ? "" : "s"} · ${dressesIn(sec.rows)} dresses`}
        />
      ),
    });
    for (const b of sec.rows) {
      blocks.push({ key: `bk-${sec.division.key}-${b.id}`, node: <PackingBookingCard b={b} /> });
    }
  }

  if (ordersRows.length > 0) {
    blocks.push({
      key: "sec-orders",
      keepWithNext: true,
      node: <SectionHeading label="Custom orders" right={`${ordersRows.reduce((n, b) => n + b.orders.length, 0)} orders`} />,
    });
    for (const b of ordersRows) blocks.push({ key: `ord-${b.id}`, node: <OrdersCard b={b} /> });
  }

  return (
    <div className="bw-root">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS + PACKING_CSS }} />

      <PackingPrintFilters
        key={`${from}|${to}|${category}`}
        from={from}
        to={to}
        category={category}
        divisionOptions={PACKING_DIVISIONS.map((d) => ({
          value: packingDivisionFilterValue(d.key),
          label: formatPackingCategoryFilterLabel(packingDivisionFilterValue(d.key)),
        }))}
        groups={groups.map((g) => ({ label: g.label, names: [...g.names] }))}
        autoPrint={sp.autoprint === "1"}
      />

      <PrintPaginator blocks={blocks} footerLabel={`Packing list · Delivery ${rangeLabel} · ${filterLabel}`} />
    </div>
  );
}
