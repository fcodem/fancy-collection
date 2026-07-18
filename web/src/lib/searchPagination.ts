export const DEFAULT_SEARCH_PAGE_SIZE = 100;
export const MAX_SEARCH_PAGE_SIZE = 200;
export const DASHBOARD_SEARCH_LIMIT = 50;

/** Delivery / Return / Jewellery operational lists */
export const OPERATIONAL_LIST_DEFAULT_PAGE_SIZE = 25;
export const OPERATIONAL_LIST_MAX_PAGE_SIZE = 50;

/** Dashboard today-stat drilldowns */
export const DASHBOARD_STAT_DEFAULT_PAGE_SIZE = 25;
export const DASHBOARD_STAT_MAX_PAGE_SIZE = 50;

export function parseSearchPageParams(
  pageRaw?: string | null,
  pageSizeRaw?: string | null,
): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const pageSize = Math.min(
    MAX_SEARCH_PAGE_SIZE,
    Math.max(1, parseInt(pageSizeRaw || String(DEFAULT_SEARCH_PAGE_SIZE), 10) || DEFAULT_SEARCH_PAGE_SIZE),
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export type SearchPageMeta = {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export function searchPageMeta(total: number, page: number, pageSize: number): SearchPageMeta {
  return {
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}
