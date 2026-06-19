import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser, isOwner } from "@/lib/auth";
import ServerAppShell from "@/components/ServerAppShell";
import InventoryFilterBar from "@/components/InventoryFilterBar";
import InventoryDeleteButton from "@/components/InventoryDeleteButton";
import { dressDisplayName, stripUnitSuffix } from "@/lib/dress";
import { photoUrl } from "@/lib/photoUrl";
import type { ClothingItem } from "@prisma/client";

type InventoryGroup = {
  key: string;
  baseName: string;
  category: string;
  size: string;
  items: ClothingItem[];
};

function groupInventoryItems(items: Awaited<ReturnType<typeof prisma.clothingItem.findMany>>): InventoryGroup[] {
  const map = new Map<string, InventoryGroup>();
  for (const item of items) {
    const baseName = stripUnitSuffix(item.name);
    const key = `${baseName}|${item.category}|${item.size || ""}|${item.color || ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        key,
        baseName,
        category: item.category,
        size: item.size || "",
        items: [item],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) return cat;
    return a.baseName.localeCompare(b.baseName);
  });
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const category = sp.category || "";
  const status = sp.status || "";

  const items = await prisma.clothingItem.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 200,
  });

  const groups = groupInventoryItems(items);
  const owner = isOwner(user);

  return (
    <ServerAppShell>
      <InventoryFilterBar q={q} status={status} showAdd={isOwner(user)} />
      <div className="card">
        <div className="card-body p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>SKU</th>
                <th>Name</th>
                <th>Qty</th>
                <th>Category</th>
                <th>Size</th>
                <th>Status</th>
                <th>Rate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const primary = group.items[0];
                const available = group.items.filter((i) => i.status === "available").length;
                const statusLabel =
                  group.items.length === 1
                    ? primary.status
                    : `${available}/${group.items.length} avail`;
                const statusClass = group.items.length === 1 ? primary.status : available > 0 ? "available" : primary.status;
                return (
                  <tr key={group.key}>
                    <td>
                      {(() => {
                        const thumb = photoUrl(primary.photo);
                        return thumb ? (
                          <img src={thumb} alt="" className="inv-list-thumb" />
                        ) : (
                          <span className="inv-list-thumb-empty">—</span>
                        );
                      })()}
                    </td>
                    <td>
                      {group.items.length === 1 ? (
                        primary.sku
                      ) : (
                        <span title={group.items.map((i) => i.sku).join(", ")}>{group.items.length} units</span>
                      )}
                    </td>
                    <td>
                      {group.items.length === 1 ? (
                        <Link href={`/inventory/${primary.id}`}>
                          {dressDisplayName(primary.name, primary.category, primary.size)}
                        </Link>
                      ) : (
                        <details>
                          <summary style={{ cursor: "pointer" }}>
                            {dressDisplayName(group.baseName, group.category, group.size)}
                          </summary>
                          <ul className="inv-unit-list">
                            {group.items.map((item) => (
                              <li key={item.id}>
                                <Link href={`/inventory/${item.id}`}>
                                  {dressDisplayName(item.name, item.category, item.size)} ({item.sku})
                                </Link>
                                {" "}
                                <span className={`badge badge-${item.status}`}>{item.status}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td>{group.items.length}</td>
                    <td>{group.category}</td>
                    <td>{group.size || "—"}</td>
                    <td><span className={`badge badge-${statusClass}`}>{statusLabel}</span></td>
                    <td>₹{primary.dailyRate.toLocaleString()}</td>
                    <td>
                      <div className="inv-row-actions">
                        {group.items.length === 1 ? (
                          <>
                            <Link href={`/inventory/${primary.id}`} className="btn btn-sm btn-outline">
                              Details
                            </Link>
                            {owner && (
                              <InventoryDeleteButton
                                id={primary.id}
                                label={dressDisplayName(primary.name, primary.category, primary.size)}
                              />
                            )}
                          </>
                        ) : (
                          <details className="inv-unit-actions-details">
                            <summary className="btn btn-sm btn-outline inv-unit-actions-summary">
                              Units ({group.items.length})
                            </summary>
                            <ul className="inv-unit-actions-list">
                              {group.items.map((item) => (
                                <li key={item.id}>
                                  <span className="inv-unit-actions-label">
                                    {dressDisplayName(item.name, item.category, item.size)} ({item.sku})
                                  </span>
                                  <div className="inv-row-actions">
                                    <Link href={`/inventory/${item.id}`} className="btn btn-sm btn-outline">
                                      Details
                                    </Link>
                                    {owner && (
                                      <InventoryDeleteButton
                                        id={item.id}
                                        label={dressDisplayName(item.name, item.category, item.size)}
                                      />
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ServerAppShell>
  );
}
