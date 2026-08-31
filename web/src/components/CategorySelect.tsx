"use client";

import { useEffect, useState } from "react";
import {
  BASE_ACCESSORY,
  BASE_JEWELLERY,
  BASE_MENS,
  BASE_WOMENS,
} from "@/lib/constants";
import { cachedFetchJson } from "@/lib/clientRequestCache";
import {
  packingDivisionFilterLabel,
  packingDivisionFilterValue,
  type PackingDivision,
} from "@/lib/packingDivision";

export type CategoryLists = {
  mens_categories: string[];
  womens_categories: string[];
  jewellery_categories: string[];
  accessory_categories: string[];
  other_categories?: string[];
};

const FALLBACK: CategoryLists = {
  mens_categories: BASE_MENS,
  womens_categories: BASE_WOMENS,
  jewellery_categories: BASE_JEWELLERY,
  accessory_categories: BASE_ACCESSORY,
  other_categories: ["Other"],
};

export default function CategorySelect({
  id,
  value,
  onChange,
  className = "form-control",
  categories: categoriesProp,
  includeDivisionFilters = false,
}: {
  id?: string;
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
  categories?: CategoryLists | null;
  /** When true, adds "All Men's / Women's / Jewellery" options for whole-section filters. */
  includeDivisionFilters?: boolean;
}) {
  const [loaded, setLoaded] = useState<CategoryLists | null>(categoriesProp ?? null);

  useEffect(() => {
    if (categoriesProp) {
      setLoaded(categoriesProp);
      return;
    }
    let cancelled = false;
    cachedFetchJson(
      "categories:all",
      async (signal) => {
        const res = await fetch("/api/categories", { credentials: "same-origin", signal });
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json() as Promise<CategoryLists>;
      },
      { ttlMs: 25_000 },
    )
      .then((data) => {
        if (!cancelled) setLoaded(data);
      })
      .catch(() => {
        if (!cancelled) setLoaded(FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [categoriesProp]);

  const cats = loaded ?? FALLBACK;
  const other = (cats.other_categories || []).filter(
    (c) => c.trim().toLowerCase() !== "other",
  );

  const divisionOptions: Array<{ key: PackingDivision; label: string; value: string }> = includeDivisionFilters
    ? [
        { key: "mens", label: packingDivisionFilterLabel("mens"), value: packingDivisionFilterValue("mens") },
        { key: "womens", label: packingDivisionFilterLabel("womens"), value: packingDivisionFilterValue("womens") },
        {
          key: "jewellery",
          label: packingDivisionFilterLabel("jewellery"),
          value: packingDivisionFilterValue("jewellery"),
        },
      ]
    : [];

  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange?.(e.target.value)}>
      <option value="">All Categories</option>
      <optgroup label="Men's">
        {divisionOptions
          .filter((option) => option.key === "mens")
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        {cats.mens_categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
      <optgroup label="Women's">
        {divisionOptions
          .filter((option) => option.key === "womens")
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        {cats.womens_categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
      <optgroup label="Jewellery">
        {divisionOptions
          .filter((option) => option.key === "jewellery")
          .map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        {cats.jewellery_categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
      <optgroup label="Accessories">
        {cats.accessory_categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
      {other.length > 0 ? (
        <optgroup label="Other">
          {other.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
