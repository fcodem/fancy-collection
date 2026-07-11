import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import InventoryDeleteButton from "@/components/InventoryDeleteButton";
import InventoryDetailPhoto from "@/components/InventoryDetailPhoto";
import { dressDisplayName } from "@/lib/dress";
import { catalogPhotoUrl } from "@/lib/catalogPhotoUrl";
import { formatDate } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function InventoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (id === "add") redirect("/inventory/add");
  const itemId = parseInt(id, 10);
  if (!itemId) notFound();

  const item = await prisma.clothingItem.findUnique({
    where: { id: itemId },
    include: {
      aiProfile: {
        select: {
          aiStatus: true,
          needsReindex: true,
          indexFailureReason: true,
          pipelineVersion: true,
          recognitionVersion: true,
          matchingVersion: true,
        },
      },
    },
  });
  if (!item) notFound();

  const owner = isOwner(user);
  const displayName = dressDisplayName(item.name, item.category, item.size);
  // Enhancement paused — always show the latest uploaded photo field.
  const photoSrc = catalogPhotoUrl(item) || null;
  const aiStatus = item.aiProfile?.aiStatus || "PENDING";
  const aiIncomplete = aiStatus !== "READY" || item.aiProfile?.needsReindex;

  const aiTone =
    aiStatus === "READY"
      ? { bg: "#c6f6d5", color: "#1a7a3c" }
      : aiStatus === "PROCESSING" || aiStatus === "PENDING"
        ? { bg: "#fefcbf", color: "#975a16" }
        : aiStatus === "STALE"
          ? { bg: "#feebc8", color: "#c05621" }
          : { bg: "#fed7d7", color: "#c53030" };

  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: "SKU", value: item.sku },
    { label: "Name", value: displayName },
    { label: "Category", value: item.category },
    { label: "Size", value: item.size || "—" },
    { label: "Color", value: item.color || "—" },
    { label: "Sub-Category", value: item.subCategory || "Normal" },
    {
      label: "Status",
      value: <span className={`badge badge-${item.status}`}>{item.status}</span>,
    },
    {
      label: "AI Profile",
      value: (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              background: aiTone.bg,
              color: aiTone.color,
              width: "fit-content",
            }}
          >
            {aiStatus}
          </span>
          {aiIncomplete ? (
            <span style={{ fontSize: 12, color: "#c05621" }}>
              AI profile incomplete. Reindex required.
            </span>
          ) : null}
        </span>
      ),
    },
    { label: "Daily Rate", value: `₹${item.dailyRate.toLocaleString()}` },
    { label: "Deposit", value: `₹${item.deposit.toLocaleString()}` },
    { label: "Item Type", value: item.itemType },
    { label: "Condition Notes", value: item.conditionNotes?.trim() || "—" },
    { label: "Added On", value: formatDate(item.createdAt, "display") },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div
          className="card-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            Stock Details
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/inventory" className="btn btn-outline btn-sm">
              Back to Inventory
            </Link>
            {owner && (
              <Link href={`/inventory/${item.id}/edit`} className="btn btn-primary btn-sm">
                Edit
              </Link>
            )}
            {owner && <InventoryDeleteButton id={item.id} label={displayName} />}
          </div>
        </div>
        <div className="card-body">
          <div className="inv-detail-layout">
            <div className="inv-detail-photo">
              {photoSrc ? (
                <InventoryDetailPhoto src={photoSrc} alt={displayName} />
              ) : (
                <div className="inv-detail-photo-empty">No photo uploaded</div>
              )}
            </div>
            <div className="inv-detail-grid">
              {fields.map((f) => (
                <div key={f.label} className="inv-detail-field">
                  <div className="inv-detail-label">{f.label}</div>
                  <div className="inv-detail-value">{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
