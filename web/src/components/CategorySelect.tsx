"use client";

import { BASE_MENS, BASE_WOMENS, BASE_JEWELLERY, BASE_ACCESSORY } from "@/lib/constants";

export default function CategorySelect({
  id,
  value,
  onChange,
  className = "form-control",
}: {
  id?: string;
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange?.(e.target.value)}>
      <option value="">All Categories</option>
      <optgroup label="Men's">{BASE_MENS.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
      <optgroup label="Women's">{BASE_WOMENS.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
      <optgroup label="Jewellery">{BASE_JEWELLERY.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
      <optgroup label="Accessories">{BASE_ACCESSORY.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
    </select>
  );
}
