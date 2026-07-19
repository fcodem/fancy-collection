import Link from "next/link";
import prisma from "@/lib/prisma";
import ProspectLeadActions from "@/components/ProspectLeadActions";
import ShopEnquiryActions from "@/components/ShopEnquiryActions";
import { dressDisplayName } from "@/lib/dress";
import { formatDate } from "@/lib/constants";
import { formatInr } from "@/lib/format";

export default async function ProspectLeadsPage() {
  const [leads, enquiries] = await Promise.all([
    prisma.prospectLead.findMany({
      include: { items: { include: { item: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.shopEnquiry.findMany({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            <i className="fa-solid fa-user-clock" style={{ marginRight: 8, color: "var(--primary)" }} />
            Prospect Leads
          </h3>
          <Link href="/prospect-leads/new" className="btn btn-primary btn-sm">
            <i className="fa-solid fa-plus" /> Add Prospect
          </Link>
        </div>
        <div className="card-body p-0">
          {leads.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              <i className="fa-solid fa-user-clock" style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }} />
              <p>No prospect leads yet. Add customers who visited and selected dresses but did not book.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Dresses</th>
                    <th>Dates</th>
                    <th>Notes</th>
                    <th>Staff</th>
                    <th>Last Reminder</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.customerName}</div>
                        {l.venue && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.venue}</div>}
                      </td>
                      <td>
                        <div>{l.contact1 || "—"}</div>
                        {l.whatsappNo && (
                          <div style={{ fontSize: 11, color: "#25D366" }}>
                            <i className="fa-brands fa-whatsapp" /> {l.whatsappNo}
                          </div>
                        )}
                      </td>
                      <td>
                        {l.items.map((pi) => (
                          <span key={pi.id} className="badge badge-info" style={{ margin: 2, display: "inline-block" }}>
                            {pi.item
                              ? dressDisplayName(pi.item.name, pi.item.category, pi.item.size)
                              : `#${pi.itemId}`}
                            {pi.rent > 0 ? ` · ₹${formatInr(pi.rent)}` : ""}
                          </span>
                        ))}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div>
                          <strong>Del:</strong> {formatDate(l.deliveryDate, "display")}
                          {l.deliveryTime ? ` ${l.deliveryTime}` : ""}
                        </div>
                        <div>
                          <strong>Ret:</strong> {formatDate(l.returnDate, "display")}
                          {l.returnTime ? ` ${l.returnTime}` : ""}
                        </div>
                      </td>
                      <td style={{ maxWidth: 180, wordBreak: "break-word", fontSize: 12 }}>{l.notes || "—"}</td>
                      <td style={{ fontSize: 12 }}>{l.staffNames || "—"}</td>
                      <td style={{ fontSize: 12 }}>
                        {l.lastReminderAt
                          ? l.lastReminderAt.toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td>
                        <ProspectLeadActions leadId={l.id} hasPhone={!!(l.whatsappNo || l.contact1)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="card-title">
            <i className="fa-solid fa-circle-question" style={{ marginRight: 8, color: "var(--primary)" }} />
            Shop Enquiries
          </h3>
          <Link href="/shop-enquiries/new" className="btn btn-primary btn-sm">
            <i className="fa-solid fa-plus" /> Add Enquiry
          </Link>
        </div>
        <div className="card-body p-0">
          {enquiries.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
              <i className="fa-solid fa-circle-question" style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }} />
              <p>No shop enquiries yet. Add visitors who came only for enquiry without dress selection.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Visit Date</th>
                    <th>Dress Needed</th>
                    <th>Notes</th>
                    <th>Staff</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enquiries.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{e.customerName}</div>
                        {e.customerAddress && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.customerAddress}</div>
                        )}
                      </td>
                      <td>
                        <div>{e.contact1 || "—"}</div>
                        {e.whatsappNo && (
                          <div style={{ fontSize: 11, color: "#25D366" }}>
                            <i className="fa-brands fa-whatsapp" /> {e.whatsappNo}
                          </div>
                        )}
                      </td>
                      <td>{formatDate(e.visitDate, "display")}</td>
                      <td>
                        {e.dressNeededDate ? formatDate(e.dressNeededDate, "display") : "—"}
                      </td>
                      <td style={{ maxWidth: 220, wordBreak: "break-word", fontSize: 12 }}>{e.enquiryNotes || "—"}</td>
                      <td style={{ fontSize: 12 }}>{e.staffNames || "—"}</td>
                      <td>
                        <ShopEnquiryActions enquiryId={e.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
