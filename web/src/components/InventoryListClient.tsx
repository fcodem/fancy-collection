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
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { BOOKING_EVENTS, INVENTORY_EVENTS } from "@/lib/realtime/types";
import PrefetchOnIntentLink from "@/components/PrefetchOnIntentLink";
import DressNameSuggestInput from "@/components/DressNameSuggestInput";
import CategorySelect from "@/components/CategorySelect";
import ZoomableImage from "@/components/ZoomableImage";
import { useAbortableSearch } from "@/hooks/useAbortableSearch";
import { useBoundedQueryCache } from "@/hooks/useBoundedQueryCache";
import type { InventoryGroupSummary, MensSizeSummary } from "@/lib/services/inventoryList";
import { dressDisplayName } from "@/lib/dress";
import { useToast } from "@/components/ui/Toast";
import { MENS_CATEGORIES, REMOVED_SUB_CATEGORIES, SIZES } from "@/lib/constants";

const REMOVED_SUB_SET = new Set(REMOVED_SUB_CATEGORIES.map((s) => s.toLowerCase()));
const MENS_SET = new Set(MENS_CATEGORIES.map((c) => c.toLowerCase()));

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
  initialSubCategory: string;
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
  initialSubCategory,
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
  const [subCategoryVal, setSubCategoryVal] = useState(initialSubCategory);
  const [subCategoryOptions, setSubCategoryOptions] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Record<string, GroupUnit[] | "loading">>({});
  const [mensSizes, setMensSizes] = useState<Record<string, MensSizeSummary[] | "loading">>({});
  const [mensAddSize, setMensAddSize] = useState<Record<string, string>>({});
  const [mensAddQty, setMensAddQty] = useState<Record<string, string>>({});
  const [mensBusy, setMensBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [drawer, setDrawer] = useState<InventoryGroupSummary | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<InventoryDetail | null>(null);
  const detailCacheRef = useRef(new Map<number, InventoryDetail>());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    markPerf("inventory-shell-rendered");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sub-categories", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const names = Array.isArray(data?.sub_categories)
          ? data.sub_categories
              .map((s: { name: string }) => String(s.name || "").trim())
              .filter((n: string) => n && !REMOVED_SUB_SET.has(n.toLowerCase()))
          : [];
        setSubCategoryOptions(names);
      })
      .catch(() => {
        if (!cancelled) setSubCategoryOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildKey = useCallback(
    (q: string, status: string, category: string, subCategory: string, cursor: string | null) =>
      `list|${q}|${status}|${category}|${subCategory}|${cursor || ""}|${pageSize}`,
    [pageSize],
  );

  const fetchPage = useCallback(
    async (
      q: string,
      status: string,
      category: string,
      subCategory: string,
      cursor: string | null,
      opts: { append: boolean; debounce: boolean },
    ) => {
      const key = buildKey(q, status, category, subCategory, cursor);
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
            if (subCategory) params.set("sub_category", subCategory);
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

  useRealtimeRefresh([...BOOKING_EVENTS, ...INVENTORY_EVENTS], () => {
    cache.clear();
    fetchPage(deferredQuery, statusVal, categoryVal, subCategoryVal, null, {
      append: false,
      debounce: false,
    });
  });

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
    if (subCategoryVal) params.set("sub_category", subCategoryVal);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    void fetchPage(deferredQuery, statusVal, categoryVal, subCategoryVal, null, {
      append: false,
      debounce: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional filter sync
  }, [deferredQuery, statusVal, categoryVal, subCategoryVal]);

  function onFilterSubmit(e: FormEvent) {
    e.preventDefault();
    markPerf("inventory-filter-submit");
    void fetchPage(query, statusVal, categoryVal, subCategoryVal, null, {
      append: false,
      debounce: false,
    });
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

  async function toggleMensSizes(g: InventoryGroupSummary) {
    const key = g.groupKey;
    if (mensSizes[key]) {
      setMensSizes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setMensSizes((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const res = await fetch(`/api/inventory/${g.primaryId}/mens-sizes`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("sizes failed");
      const data = (await res.json()) as { sizes: MensSizeSummary[] };
      const nextSizes = data.sizes?.length ? data.sizes : g.sizes || [];
      setMensSizes((prev) => ({ ...prev, [key]: nextSizes }));
      if (nextSizes.length) {
        setGroups((prev) =>
          prev.map((row) =>
            row.groupKey === key
              ? {
                  ...row,
                  sizes: nextSizes,
                  size: nextSizes.map((s) => s.size).join(", "),
                  totalQuantity: nextSizes.reduce((n, s) => n + s.totalQuantity, 0),
                  availableQuantity: nextSizes.reduce((n, s) => n + s.availableQuantity, 0),
                  rentedQuantity: nextSizes.reduce((n, s) => n + s.rentedQuantity, 0),
                  maintenanceQuantity: nextSizes.reduce(
                    (n, s) => n + s.maintenanceQuantity,
                    0,
                  ),
                }
              : row,
          ),
        );
      }
    } catch {
      // Fall back to any sizes already on the card so the panel still opens.
      if (g.sizes?.length) {
        setMensSizes((prev) => ({ ...prev, [key]: g.sizes || [] }));
        return;
      }
      setMensSizes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      showToast("Could not load sizes", "error");
    }
  }

  async function refreshMensSizes(g: InventoryGroupSummary, seedIdOverride?: number) {
    const seedId = seedIdOverride || g.primaryId;
    try {
      const res = await fetch(`/api/inventory/${seedId}/mens-sizes`, {
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { sizes: MensSizeSummary[] };
      const nextSizes = data.sizes || [];
      setMensSizes((prev) => ({ ...prev, [g.groupKey]: nextSizes }));
      if (!nextSizes.length) {
        setGroups((prev) => prev.filter((row) => row.groupKey !== g.groupKey));
        return;
      }
      setGroups((prev) =>
        prev.map((row) =>
          row.groupKey === g.groupKey
            ? {
                ...row,
                primaryId: nextSizes[0]!.primaryId,
                primarySku: nextSizes[0]!.primarySku,
                sizes: nextSizes,
                size: nextSizes.map((s) => s.size).join(", "),
                totalQuantity: nextSizes.reduce((n, s) => n + s.totalQuantity, 0),
                availableQuantity: nextSizes.reduce((n, s) => n + s.availableQuantity, 0),
                rentedQuantity: nextSizes.reduce((n, s) => n + s.rentedQuantity, 0),
                maintenanceQuantity: nextSizes.reduce(
                  (n, s) => n + s.maintenanceQuantity,
                  0,
                ),
              }
            : row,
        ),
      );
    } catch {
      /* ignore */
    }
  }

  async function addMensSize(g: InventoryGroupSummary) {
    const size = (mensAddSize[g.groupKey] || "").trim();
    const quantity = Math.max(1, Math.min(Number(mensAddQty[g.groupKey]) || 1, 50));
    if (!size) {
      showToast("Choose a size to add", "error");
      return;
    }
    setMensBusy(`${g.groupKey}:add`);
    try {
      const res = await fetch(`/api/inventory/${g.primaryId}/mens-sizes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", size, quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast((data as { error?: string }).error || "Could not add size", "error");
        return;
      }
      setMensAddSize((prev) => ({ ...prev, [g.groupKey]: "" }));
      setMensAddQty((prev) => ({ ...prev, [g.groupKey]: "1" }));
      cache.clear();
      await refreshMensSizes(g);
      showToast(`Size ${size} added (${quantity} unit${quantity === 1 ? "" : "s"})`, "success");
    } finally {
      setMensBusy(null);
    }
  }

  async function deleteMensProduct(g: InventoryGroupSummary) {
    if (
      !confirm(
        `Delete entire product "${g.baseName}" and ALL its sizes/units? This cannot be undone.`,
      )
    ) {
      return;
    }
    setMensBusy(`${g.groupKey}:del`);
    try {
      const res = await fetch(`/api/inventory/${g.primaryId}/mens-sizes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-product" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast((data as { error?: string }).error || "Could not delete product", "error");
        return;
      }
      cache.clear();
      setGroups((prev) => prev.filter((row) => row.groupKey !== g.groupKey));
      setMensSizes((prev) => {
        const next = { ...prev };
        delete next[g.groupKey];
        return next;
      });
      showToast("Product deleted", "success");
    } finally {
      setMensBusy(null);
    }
  }

  async function removeMensSize(g: InventoryGroupSummary, size: string) {
    if (!confirm(`Remove size ${size} from ${g.baseName}? All units of this size will be deleted.`)) {
      return;
    }
    const panel = mensSizes[g.groupKey];
    const currentSizes = Array.isArray(panel) ? panel : g.sizes || [];
    const survivor = currentSizes.find(
      (s) => s.size.toLowerCase() !== size.toLowerCase(),
    );
    setMensBusy(`${g.groupKey}:rm:${size}`);
    try {
      const res = await fetch(`/api/inventory/${g.primaryId}/mens-sizes`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", size }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast((data as { error?: string }).error || "Could not remove size", "error");
        return;
      }
      cache.clear();
      await refreshMensSizes(g, survivor?.primaryId);
      showToast(`Size ${size} removed`, "success");
    } finally {
      setMensBusy(null);
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
            <select
              name="sub_category"
              value={subCategoryVal}
              onChange={(e) => setSubCategoryVal(e.target.value)}
              className="form-control"
              aria-label="Sub-category"
            >
              <option value="">All Sub-Categories</option>
              {subCategoryVal &&
                !subCategoryOptions.includes(subCategoryVal) && (
                  <option value={subCategoryVal}>{subCategoryVal}</option>
                )}
              {subCategoryOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Searching…" : "Search"}
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
          const isMens = Boolean(g.isMensProduct) || MENS_SET.has(g.category.toLowerCase());
          const badge = statusBadge(g);
          const caption = isMens
            ? g.baseName
            : dressDisplayName(g.baseName, g.category, g.size);
          const units = expanded[g.groupKey];
          const sizePanel = mensSizes[g.groupKey];
          const sizesOpen = sizePanel === "loading" || Array.isArray(sizePanel);
          const displaySizes = Array.isArray(sizePanel)
            ? sizePanel
            : g.sizes || [];
          const presentSizes = new Set(displaySizes.map((s) => s.size.toLowerCase()));
          const addableSizes = SIZES.filter((s) => !presentSizes.has(s.toLowerCase()));
          return (
            <article
              key={g.groupKey}
              className={`inv-card${sizesOpen ? " inv-card-expanded" : ""}`}
            >
              <button
                type="button"
                className="inv-card-main"
                onClick={() => (isMens ? void toggleMensSizes(g) : openRow(g))}
              >
                {g.thumbnailUrl ? (
                  <ZoomableImage
                    src={g.thumbnailUrl}
                    fullSrc={g.photoUrl || g.thumbnailUrl}
                    alt=""
                    overlayCaption={caption}
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
                    {isMens ? (
                      <>
                        {displaySizes.length
                          ? `${displaySizes.length} size${displaySizes.length === 1 ? "" : "s"}: ${displaySizes.map((s) => s.size).join(", ")}`
                          : g.size
                            ? `Sizes: ${g.size}`
                            : "Tap to view sizes"}
                        {` · ${g.totalQuantity} unit${g.totalQuantity === 1 ? "" : "s"}`}
                      </>
                    ) : (
                      <>
                        {g.totalQuantity === 1 ? g.primarySku : `${g.totalQuantity} units`}
                        {g.size ? ` · ${g.size}` : ""}
                        {g.color ? ` · ${g.color}` : ""}
                      </>
                    )}
                  </div>
                  <div className="inv-card-stats">
                    <span className={`badge badge-${badge.className}`}>{badge.label}</span>
                    <span>
                      {g.category}
                      {g.subCategory ? ` · ${g.subCategory}` : ""}
                    </span>
                    <span>₹{g.dailyRate.toLocaleString()}</span>
                    {isMens ? (
                      <span style={{ color: "var(--primary, #1d4ed8)", fontWeight: 600 }}>
                        {sizesOpen ? "Hide sizes ▲" : "View sizes ▼"}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
              <div className="inv-card-actions">
                {!isMens ? (
                  <PrefetchOnIntentLink
                    href={`/inventory/${g.primaryId}`}
                    className="btn btn-sm btn-outline inv-touch"
                  >
                    Details
                  </PrefetchOnIntentLink>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline inv-touch"
                      onClick={() => void toggleMensSizes(g)}
                    >
                      {sizesOpen ? "Hide sizes" : "Sizes"}
                    </button>
                    {isOwner ? (
                      <PrefetchOnIntentLink
                        href={`/inventory/${g.primaryId}/edit`}
                        className="btn btn-sm btn-primary inv-touch"
                      >
                        Edit
                      </PrefetchOnIntentLink>
                    ) : (
                      <PrefetchOnIntentLink
                        href={`/inventory/${g.primaryId}`}
                        className="btn btn-sm btn-outline inv-touch"
                      >
                        Open
                      </PrefetchOnIntentLink>
                    )}
                  </>
                )}
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
                  {!isMens && g.totalQuantity > 1 && (
                    <button type="button" onClick={() => expandGroup(g.groupKey)}>
                      Show units
                    </button>
                  )}
                  {isOwner && !isMens && g.totalQuantity === 1 && (
                    <button
                      type="button"
                      disabled={deletingId === g.primaryId}
                      onClick={() => handleDelete(g.primaryId, caption, g.groupKey)}
                    >
                      Delete
                    </button>
                  )}
                  {isMens && isOwner ? (
                    <button
                      type="button"
                      style={{ color: "#b91c1c" }}
                      disabled={mensBusy === `${g.groupKey}:del`}
                      onClick={() => void deleteMensProduct(g)}
                    >
                      {mensBusy === `${g.groupKey}:del` ? "Deleting…" : "Delete whole product"}
                    </button>
                  ) : null}
                </div>
              )}
              {isMens && sizePanel === "loading" && (
                <div className="inv-unit-list" style={{ padding: 12 }}>Loading sizes…</div>
              )}
              {isMens && Array.isArray(sizePanel) && (
                <div
                  className="inv-mens-sizes"
                  style={{ padding: "12px", borderTop: "1px solid var(--border)" }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
                    Sizes — edit or remove from this product
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {sizePanel.map((sz) => (
                      <div
                        key={`${sz.groupKey}-${sz.size}`}
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "var(--bg, #f8fafc)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div>
                          <strong>Size {sz.size}</strong>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                            {sz.primarySku} · {sz.availableQuantity}/{sz.totalQuantity} avail
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <PrefetchOnIntentLink
                            href={`/inventory/${sz.primaryId}/edit`}
                            className="btn btn-sm btn-primary"
                          >
                            Edit
                          </PrefetchOnIntentLink>
                          <PrefetchOnIntentLink
                            href={`/inventory/${sz.primaryId}`}
                            className="btn btn-sm btn-outline"
                          >
                            Open
                          </PrefetchOnIntentLink>
                          {isOwner ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              style={{ color: "#b91c1c" }}
                              disabled={mensBusy === `${g.groupKey}:rm:${sz.size}`}
                              onClick={() => void removeMensSize(g, sz.size)}
                            >
                              {mensBusy === `${g.groupKey}:rm:${sz.size}`
                                ? "Removing…"
                                : "Remove size"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!sizePanel.length ? (
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                        No sizes found for this product.
                      </p>
                    ) : null}
                  </div>
                  {isOwner ? (
                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <select
                        className="form-control"
                        style={{ maxWidth: 140 }}
                        value={mensAddSize[g.groupKey] || ""}
                        onChange={(e) =>
                          setMensAddSize((prev) => ({
                            ...prev,
                            [g.groupKey]: e.target.value,
                          }))
                        }
                        aria-label="Add size"
                      >
                        <option value="">Size…</option>
                        {addableSizes.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className="form-control"
                        style={{ maxWidth: 90 }}
                        value={mensAddQty[g.groupKey] || "1"}
                        onChange={(e) =>
                          setMensAddQty((prev) => ({
                            ...prev,
                            [g.groupKey]: e.target.value,
                          }))
                        }
                        aria-label="Units for size"
                        placeholder="Units"
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={
                          !mensAddSize[g.groupKey] || mensBusy === `${g.groupKey}:add`
                        }
                        onClick={() => void addMensSize(g)}
                      >
                        {mensBusy === `${g.groupKey}:add` ? "Adding…" : "Add size"}
                      </button>
                    </div>
                  ) : null}
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
              fetchPage(deferredQuery, statusVal, categoryVal, subCategoryVal, nextCursor, {
                append: true,
                debounce: false,
              })
            }
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {drawer && (() => {
        const drawerIsMens =
          Boolean(drawer.isMensProduct) || MENS_SET.has(drawer.category.toLowerCase());
        const drawerCaption = drawerIsMens
          ? drawer.baseName
          : dressDisplayName(drawer.baseName, drawer.category, drawer.size);
        return (
        <div className="inv-drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside
            className="inv-drawer"
            role="dialog"
            aria-label="Inventory quick view"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="inv-drawer-header">
              <h3>{drawerCaption}</h3>
              <button type="button" className="btn btn-sm" onClick={() => setDrawer(null)}>
                Close
              </button>
            </header>
            <div className="inv-drawer-body">
              {drawer.thumbnailUrl ? (
                <ZoomableImage
                  src={drawer.thumbnailUrl}
                  fullSrc={
                    drawerDetail?.original_photo_url ||
                    drawerDetail?.photo_url ||
                    drawer.photoUrl ||
                    drawer.thumbnailUrl
                  }
                  alt=""
                  overlayCaption={drawerCaption}
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
                      caption: drawerCaption,
                    })
                  }
                >
                  View original image
                </button>
              )}
              {drawerIsMens && drawer.size ? (
                <p>
                  <strong>Sizes:</strong> {drawer.size}
                </p>
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
              {drawerDetail ? (
                <>
                  <p><strong>Sub-category:</strong> {drawerDetail.subCategory || "Normal"}</p>
                  <p><strong>Deposit:</strong> ₹{Number(drawerDetail.deposit || 0).toLocaleString()}</p>
                  {drawerDetail.conditionNotes ? <p><strong>Condition:</strong> {drawerDetail.conditionNotes}</p> : null}
                </>
              ) : (
                <p className="inv-drawer-hint">Loading full details…</p>
              )}
              {drawerIsMens ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setDrawer(null);
                      void toggleMensSizes(drawer);
                    }}
                  >
                    Manage sizes
                  </button>
                  <p className="inv-drawer-hint">
                    Open a size row to edit details or manage QR codes for that size.
                  </p>
                </>
              ) : (
                <>
                  <PrefetchOnIntentLink
                    href={`/inventory/${drawer.primaryId}`}
                    className="btn btn-primary"
                  >
                    {drawer.totalQuantity === 1
                      ? "Open details & QR / Barcode"
                      : "Open primary unit"}
                  </PrefetchOnIntentLink>
                  {drawer.totalQuantity > 1 ? (
                    <p className="inv-drawer-hint">
                      QR/barcodes are managed per physical unit. Use “Show units” and open the
                      required unit.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>
        );
      })()}

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
