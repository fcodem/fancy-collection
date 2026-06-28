"use client";

import { useEffect } from "react";
import { shouldUppercaseInput, uppercaseInputElement } from "@/lib/uppercaseInput";

/** Auto-uppercase text in form fields across the app (dates/passwords excluded). */
export function useGlobalUppercaseInputs() {
  useEffect(() => {
    function onInput(e: Event) {
      const target = e.target;
      if (!target || !shouldUppercaseInput(target as Element)) return;
      uppercaseInputElement(target as HTMLInputElement | HTMLTextAreaElement);
    }

    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);
}
