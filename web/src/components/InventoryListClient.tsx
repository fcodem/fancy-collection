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
import CategorySelect from "@/components/CategorySelect";
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

type InventoryDetail = {
  original_photo_url?: string;
  photo_url?: string;
  conditionNotes?: string | null;
  deposit?: number;
  subCategory?: string | null;
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
  initialCategory: string;
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
  initialCategory,
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
  const [categoryVal, setCategoryVal] = useState(initialCategory);
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, GroupUnit[] | "loading">>({});
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [drawer, setDrawer] = useState<InventoryGroupSummary | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<InventoryDetail | null>(null);
  const detailCacheRef = useRef(new Map<number, InventoryDetail>());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    markPerf("inventory-shell-rendered");
  }, []);

  const buildKey = useCallback(
    (q: string, status: string, category: string, cursor: string | null) =>
      `list|${q}|${status}|${category}|${cursor || ""}|${pageSize}`,
    [pageSize],
  );

  const fetchPage = useCallback(
    async (
      q: string,
      status: string,
      category: string,
      cursor: string | null,
      opts: { append: boolean; debounce: boolean },
    ) => {
      const key = buildKey(q, status, category, cursor);
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
            if (category) params.set("category", category);
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
    if (categoryVal) params.set("category", categoryVal);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    void fetchPage(deferredQuery, statusVal, categoryVal, null, { append: false, debounce: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional filter sync
  }, [deferredQuery, statusVal, categoryVal]);

  function onFilterSubmit(e: FormEvent) {
    e.preventDefault();
    markPerf("inventory-filter-submit");
    void fetchPage(query, statusVal, categoryVal, null, { append: false, debounce: false });
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

  async function openRow(g: InventoryGroupSummary) {
    markPerf("inventory-row-click");
    setDrawer(g);
    setDrawerDetail(null);
    markPerf("inventory-drawer-visible");
    const cached = detailCacheRef.current.get(g.primaryId);
    if (cached) {
      setDrawerDetail(cached);
      return;
    }
    try {
      const response = await fetch(`/api/inventory/${g.primaryId}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const detail = (await response.json()) as InventoryDetail;
      detailCacheRef.current.set(g.primaryId, detail);
      setDrawerDetail(detail);
    } catch {
      /* quick summary remains usable */
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <h3 className="card-title">Manage Inventory</h3>
          {isOwner && (
            <>
              <PrefetchOnIntentLink href="/inventory/add" className="btn btn-primary btn-sm">
                Add Item
              </PrefetchOnIntentLink>
              <PrefetchOnIntentLink href="/inventory/print-codes" className="btn btn-outline-secondary btn-sm ms-2">
                Print QR/Barcodes
              </PrefetchOnIntentLink>
            </>
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
            <CategorySelect value={categoryVal} onChange={setCategoryVal} />
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "…" : "Filter"}
            </button>
            {loading ? <span className="inv-inline-loading" aria-live="polite">Updating…</span> : null}
          </form>
        </div>
      </div>

      {/* One responsive tree for desktop, tablet and mobile. */}
      <div
        className="inv-list-responsive"
        aria-label="Inventory list"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}
      >
        {groups.map((g) => {
          const badge = statusBadge(g);
          const caption = dressDisplayName(g.baseName, g.category, g.size);
          const units = expanded[g.groupKey];
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
              {units === "loading" && (
                <div className="inv-unit-list" style={{ padding: 12 }}>Loading units…</div>
              )}
              {Array.isArray(units) && (
                <ul className="inv-unit-list">
                  {units.map((unit) => (
                    <li key={unit.id}>
                      <PrefetchOnIntentLink href={`/inventory/${unit.id}`}>
                        {unit.displayName} ({unit.sku})
                      </PrefetchOnIntentLink>{" "}
                      <span className={`badge badge-${unit.status}`}>{unit.status}</span>
                    </li>
                  ))}
                </ul>
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
              fetchPage(deferredQuery, statusVal, categoryVal, nextCursor, {
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
              {(drawerDetail?.original_photo_url || drawerDetail?.photo_url) && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    setLightbox({
                      src: drawerDetail.original_photo_url || drawerDetail.photo_url || "",
                      caption: dressDisplayName(drawer.baseName, drawer.category, drawer.size),
                    })
                  }
                >
                  View original image
                </button>
              )}
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
              {drawerDetail ? (
                <>
                  <p><strong>Sub-category:</strong> {drawerDetail.subCategory || "Normal"}</p>
                  <p><strong>Deposit:</strong> ₹{Number(drawerDetail.deposit || 0).toLocaleString()}</p>
                  {drawerDetail.conditionNotes ? <p><strong>Condition:</strong> {drawerDetail.conditionNotes}</p> : null}
                </>
              ) : (
                <p className="inv-drawer-hint">Loading full details…</p>
              )}
              <PrefetchOnIntentLink
                href={`/inventory/${drawer.primaryId}`}
                className="btn btn-primary"
              >
                {drawer.totalQuantity === 1 ? "Open details & QR / Barcode" : "Open primary unit"}
              </PrefetchOnIntentLink>
              {drawer.totalQuantity > 1 ? (
                <p className="inv-drawer-hint">
                  QR/barcodes are managed per physical unit. Use “Show units” and open the
                  required unit.
                </p>
              ) : null}
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
