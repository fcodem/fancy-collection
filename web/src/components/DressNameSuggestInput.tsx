"use client";

import { useEffect, useRef } from "react";
import { useDressSuggestScript } from "@/lib/useDressSuggestScript";

type SuggestItem = {
  name: string;
  display_name?: string;
  sku?: string;
  category?: string;
  size?: string;
};

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onSelect"> & {
  /** CSS selector for linked category dropdown, e.g. "#categoryFilter" */
  categorySelect?: string;
  /** Static category filter (used when category is controlled in React) */
  category?: string;
  onSuggestSelect?: (item: SuggestItem) => void;
  minChars?: number;
};

export default function DressNameSuggestInput({
  categorySelect,
  category,
  onSuggestSelect,
  minChars = 1,
  className = "",
  autoComplete = "off",
  ...props
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = useDressSuggestScript();
  const onChangeRef = useRef(props.onChange);
  const onSuggestRef = useRef(onSuggestSelect);
  const categoryRef = useRef(category);

  const skip = !!props["data-skip-dress-suggest" as keyof typeof props];

  onChangeRef.current = props.onChange;
  onSuggestRef.current = onSuggestSelect;
  categoryRef.current = category;

  useEffect(() => {
    if (skip) return;
    if (!ready || !inputRef.current || !window.initDressNameSuggest) return;

    const input = inputRef.current;
    if ((input as HTMLInputElement & { _dressSuggestInit?: boolean })._dressSuggestInit) return;

    const catEl = categorySelect ? (document.querySelector(categorySelect) as HTMLSelectElement | null) : null;

    window.initDressNameSuggest(input, {
      categorySelect: catEl || undefined,
      getCategory: () => categoryRef.current || "",
      minChars,
      onSelect: (item: SuggestItem) => {
        onChangeRef.current?.({
          target: { value: item.name, name: input.name },
          currentTarget: input,
        } as React.ChangeEvent<HTMLInputElement>);
        onSuggestRef.current?.(item);
      },
    });
  }, [ready, categorySelect, minChars, skip]);

  const cls = skip
    ? `form-control ${className}`.trim()
    : `form-control dress-name-suggest ${className}`.trim();

  return (
    <input
      ref={inputRef}
      {...props}
      autoComplete={autoComplete}
      className={cls}
    />
  );
}
