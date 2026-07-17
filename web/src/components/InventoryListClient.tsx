"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { usePathname } from "next/navigation";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import { useAbortableSearch } from "@/hooks/useAbortableSearch";
import { useBoundedQueryCache } from "@/hooks/useBoundedQueryCache";
import type { InventoryGroupSummary } from "@/lib/services/inventoryList";
import { dressDisplayName } from "@/lib/dress";
import { useToast } from "@/components/ui/Toast";

const InventoryLightbox = dynamic(() => import("./InventoryLightbox"), {
  ssr: false,
  loading: () => null,
});

type GroupUnit = {
  id: number;
  sku: string;
  name: string;
  displayName: string;
  status: string;
  thumbnailUrl: string | null;
};

type ListResponse = {
  groups: InventoryGroupSummary[];
  nextCursor: string | null;
  rowCount: number;
};

type Props = {
  initialGroups: InventoryGroupSummary[];
  initialNextCursor: string | null;
  initialQ: string;
  initialStatus: string;
  isOwner: boolean;
  pageSize: number;
};

function markPerf(name: string) {
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

function statusBadge(g: InventoryGroupSummary) {
  if (g.totalQuantity === 1) {
    const st =
      g.availableQuantity === 1
        ? "available"
        : g.rentedQuantity === 1
          ? "rented"
          : "maintenance";
    return { label: st, className: st };
  }
  return {
    label: `${g.availableQuantity}/${g.totalQuantity} avail`,
    className: g.availableQuantity > 0 ? "available" : "rented",
  };
}

export default function InventoryListClient({
  initialGroups,
  initialNextCursor,
  initialQ,
  initialStatus,
  isOwner,
  pageSize,
}: Props) {
  const pathname = usePathname();
  const showToast = useToast();
  const cache = useBoundedQueryCache<ListResponse>({ ttlMs: 45_000 });
  const search = useAbortableSearch(200);
  const skipFilterEffect = useRef(true);

  const [groups, setGroups] = useState(initialGroups);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [query, setQuery] = useState(initialQ);
  const [statusVal, setStatusVal] = useState(initialStatus);
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, GroupUnit[] | "loading">>({});
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [drawer, setDrawer] = useState<InventoryGroupSummary | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    markPerf("inventory-shell-rendered");
  }, []);

  const buildKey = useCallback(
    (q: string, status: string, cursor: string | null) =>
      `list|${q}|${status}|${cursor || ""}|${pageSize}`,
    [pageSize],
  );

  const fetchPage = useCallback(
    async (
      q: string,
      status: string,
      cursor: string | null,
      opts: { append: boolean; debounce: boolean },
    ) => {
      const key = buildKey(q, status, cursor);
      const cached = !cursor ? cache.get(key) : undefined;
      if (cached && !opts.append) {
        setGroups(cached.groups);
        setNextCursor(cached.nextCursor);
        return;
      }

      if (opts.append) setLoadingMore(true);
      else setLoading(true);

      try {
        const data = await search.run(
          key,
          async (signal) => {
            const params = new URLSearchParams();
            if (q.trim()) params.set("q", q.trim());
            if (status) params.set("status", status);
            if (cursor) params.set("cursor", cursor);
            params.set("limit", String(pageSize));
            params.set("sort", "name");
            const res = await fetch(`/api/inventory/list?${params}`, {
              signal,
              credentials: "same-origin",
            });
            if (!res.ok) throw new Error("list failed");
            return (await res.json()) as ListResponse;
          },
          { debounce: opts.debounce },
        );
        if (!data) return;
        cache.set(key, data);
        startTransition(() => {
          if (opts.append) {
            setGroups((prev) => {
              const seen = new Set(prev.map((g) => g.groupKey));
              return [...prev, ...data.groups.filter((g) => !seen.has(g.groupKey))];
            });
          } else {
            setGroups(data.groups);
          }
          setNextCursor(data.nextCursor);
        });
        markPerf("inventory-results-rendered");
      } catch {
        /* aborted or network — keep prior results */
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildKey, cache, pageSize, search],
  );

  // Debounced client filter — skip first mount (SSR already hydrated results)
  useEffect(() => {
    if (skipFilterEffect.current) {
      skipFilterEffect.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (deferredQuery.trim()) params.set("q", deferredQuery.trim());
    if (statusVal) params.set("status", statusVal);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    void fetchPage(deferredQuery, statusVal, null, { append: false, debounce: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional filter sync
  }, [deferredQuery, statusVal]);

  function onFilterSubmit(e: FormEvent) {
    e.preventDefault();
    markPerf("inventory-filter-submit");
    void fetchPage(query, statusVal, null, { append: false, debounce: false });
  }

  async function expandGroup(groupKey: string) {
    if (expanded[groupKey]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[groupKey];
        return next;
      });
      return;
    }
    setExpanded((prev) => ({ ...prev, [groupKey]: "loading" }));
    try {
      const res = await fetch(
        `/api/inventory/groups/${encodeURIComponent(groupKey)}/items`,
        { credentials: "same-origin" },
      );
      if (!res.ok) throw new Error("expand failed");
      const data = (await res.json()) as { items: GroupUnit[] };
      setExpanded((prev) => ({ ...prev, [groupKey]: data.items }));
    } catch {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[groupKey];
        return next;
      });
      showToast("Could not load units", "error");
    }
  }

  async function handleDelete(id: number, label: string, groupKey: string) {
    if (!confirm(`Delete ${label} from inventory? This cannot be undone.`)) return;
    markPerf("inventory-delete-start");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast((data as { error?: string }).error || "Delete failed", "error");
        return;
      }
      cache.clear();
      setGroups((prev) =>
        prev
          .map((g) => {
            if (g.groupKey !== groupKey && g.primaryId !== id) return g;
            if (g.totalQuantity <= 1) return null;
            return {
              ...g,
              totalQuantity: g.totalQuantity - 1,
              availableQuantity: Math.max(0, g.availableQuantity - 1),
            };
          })
          .filter(Boolean) as InventoryGroupSummary[],
      );
      setExpanded((prev) => {
        const units = prev[groupKey];
        if (!units || units === "loading") return prev;
        return { ...prev, [groupKey]: units.filter((u) => u.id !== id) };
      });
      if (drawer?.primaryId === id) setDrawer(null);
      showToast("Deleted", "success");
    } finally {
      setDeletingId(null);
    }
  }

  function openRow(g: InventoryGroupSummary) {
    markPerf("inventory-row-click");
    setDrawer(g);
    markPerf("inventory-drawer-visible");
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Manage Inventory</h3>
          {isOwner && (
            <PrefetchOnIntentLink href="/inventory/add" className="btn btn-primary btn-sm">
              Add Item
            </PrefetchOnIntentLink>
          )}
        </div>
        <div className="card-body">
          <form
            style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}
            onSubmit={onFilterSubmit}
          >
            <DressNameSuggestInput
              name="q"
              value={query}
              onChange={(e) => {
                markPerf("inventory-search-input");
                setQuery(e.target.value);
              }}
              onSuggestSelect={(item) => setQuery(item.sku || item.name)}
              placeholder="Search dress name or SKU…"
              style={{ flex: 1, minWidth: 200 }}
              showPhotos
            />
            <select
              name="status"
              value={statusVal}
              onChange={(e) => setStatusVal(e.target.value)}
              className="form-control"
            >
              <option value="">All Status</option>
              <option value="available">Available</option>
              <option value="rented">Rented</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "…" : "Filter"}
            </button>
            {loading ? <span className="inv-inline-loading" aria-live="polite">Updating…</span> : null}
          </form>
        </div>
      </div>

      {/* Desktop table */}
      <div className="card inv-list-desktop">
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
              {groups.map((g) => {
                const badge = statusBadge(g);
                const caption = dressDisplayName(g.baseName, g.category, g.size);
                const units = expanded[g.groupKey];
                return (
                  <tr key={g.groupKey} className="inv-row" style={{ contentVisibility: "auto" }}>
                    <td>
                      {g.thumbnailUrl ? (
                        <button
                          type="button"
                          className="inv-thumb-btn"
                          onClick={() =>
                            setLightbox({ src: g.thumbnailUrl!, caption })
                          }
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={g.thumbnailUrl}
                            alt=""
                            width={48}
                            height={48}
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            className="inv-list-thumb"
                          />
                        </button>
                      ) : (
                        <span className="inv-list-thumb-empty">—</span>
                      )}
                    </td>
                    <td>
                      {g.totalQuantity === 1 ? (
                        g.primarySku
                      ) : (
                        <span>{g.totalQuantity} units</span>
                      )}
                    </td>
                    <td>
                      {g.totalQuantity === 1 ? (
                        <PrefetchOnIntentLink href={`/inventory/${g.primaryId}`}>
                          {caption}
                        </PrefetchOnIntentLink>
                      ) : (
                        <button
                          type="button"
                          className="inv-linkish"
                          onClick={() => expandGroup(g.groupKey)}
                        >
                          {caption}
                          {units === "loading" ? "…" : units ? " ▾" : " ▸"}
                        </button>
                      )}
                      {Array.isArray(units) && (
                        <ul className="inv-unit-list">
                          {units.map((u) => (
                            <li key={u.id}>
                              <PrefetchOnIntentLink href={`/inventory/${u.id}`}>
                                {u.displayName} ({u.sku})
                              </PrefetchOnIntentLink>{" "}
                              <span className={`badge badge-${u.status}`}>{u.status}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>{g.totalQuantity}</td>
                    <td>{g.category}</td>
                    <td>{g.size || "—"}</td>
                    <td>
                      <span className={`badge badge-${badge.className}`}>{badge.label}</span>
                    </td>
                    <td>₹{g.dailyRate.toLocaleString()}</td>
                    <td>
                      <div className="inv-row-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => openRow(g)}
                        >
                          Quick
                        </button>
                        <PrefetchOnIntentLink
                          href={`/inventory/${g.primaryId}`}
                          className="btn btn-sm btn-outline"
                        >
                          Details
                        </PrefetchOnIntentLink>
                        {isOwner && g.totalQuantity === 1 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            disabled={deletingId === g.primaryId}
                            onClick={() =>
                              handleDelete(g.primaryId, caption, g.groupKey)
                            }
                          >
                            {deletingId === g.primaryId ? "…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!groups.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 24 }}>
                    No inventory matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="inv-list-mobile" aria-label="Inventory list">
        {groups.map((g) => {
          const badge = statusBadge(g);
          const caption = dressDisplayName(g.baseName, g.category, g.size);
          return (
            <article key={g.groupKey} className="inv-card">
              <button
                type="button"
                className="inv-card-main"
                onClick={() => openRow(g)}
              >
                {g.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.thumbnailUrl}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                    decoding="async"
                    className="inv-card-thumb"
                  />
                ) : (
                  <span className="inv-card-thumb inv-card-thumb-empty">—</span>
                )}
                <div className="inv-card-body">
                  <div className="inv-card-title">{caption}</div>
                  <div className="inv-card-meta">
                    {g.totalQuantity === 1 ? g.primarySku : `${g.totalQuantity} units`}
                    {g.size ? ` · ${g.size}` : ""}
                    {g.color ? ` · ${g.color}` : ""}
                  </div>
                  <div className="inv-card-stats">
                    <span className={`badge badge-${badge.className}`}>{badge.label}</span>
                    <span>₹{g.dailyRate.toLocaleString()}</span>
                  </div>
                </div>
              </button>
              <div className="inv-card-actions">
                <PrefetchOnIntentLink
                  href={`/inventory/${g.primaryId}`}
                  className="btn btn-sm btn-outline inv-touch"
                >
                  Details
                </PrefetchOnIntentLink>
                <button
                  type="button"
                  className="btn btn-sm btn-outline inv-touch"
                  aria-expanded={menuOpen === g.groupKey}
                  onClick={() =>
                    setMenuOpen((m) => (m === g.groupKey ? null : g.groupKey))
                  }
                >
                  More
                </button>
              </div>
              {menuOpen === g.groupKey && (
                <div className="inv-card-menu">
                  {g.totalQuantity > 1 && (
                    <button type="button" onClick={() => expandGroup(g.groupKey)}>
                      Show units
                    </button>
                  )}
                  {isOwner && g.totalQuantity === 1 && (
                    <button
                      type="button"
                      disabled={deletingId === g.primaryId}
                      onClick={() => handleDelete(g.primaryId, caption, g.groupKey)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!groups.length && <p className="inv-empty">No inventory matches.</p>}
      </div>

      {nextCursor && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-outline inv-touch"
            disabled={loadingMore}
            onClick={() =>
              fetchPage(deferredQuery, statusVal, nextCursor, {
                append: true,
                debounce: false,
              })
            }
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {drawer && (
        <div className="inv-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside
            className="inv-drawer"
            role="dialog"
            aria-label="Inventory quick view"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="inv-drawer-header">
              <h3>
                {dressDisplayName(drawer.baseName, drawer.category, drawer.size)}
              </h3>
              <button type="button" className="btn btn-sm" onClick={() => setDrawer(null)}>
                Close
              </button>
            </header>
            <div className="inv-drawer-body">
              {drawer.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={drawer.thumbnailUrl}
                  alt=""
                  width={160}
                  height={160}
                  className="inv-drawer-thumb"
                />
              ) : null}
              <p>
                <strong>SKU:</strong> {drawer.primarySku}
              </p>
              <p>
                <strong>Qty:</strong> {drawer.availableQuantity}/{drawer.totalQuantity}{" "}
                available
              </p>
              <p>
                <strong>Rate:</strong> ₹{drawer.dailyRate.toLocaleString()}
              </p>
              <p className="inv-drawer-hint">Loading full details…</p>
              <PrefetchOnIntentLink
                href={`/inventory/${drawer.primaryId}`}
                className="btn btn-primary"
              >
                Open full page
              </PrefetchOnIntentLink>
            </div>
          </aside>
        </div>
      )}

      {lightbox && (
        <InventoryLightbox
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
