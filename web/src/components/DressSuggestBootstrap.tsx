"use client";

import { useEffect } from "react";
import { loadDressSuggestScript } from "@/lib/useDressSuggestScript";

/** Loads dress-suggest.js once for the whole app. */
export default function DressSuggestBootstrap() {
  useEffect(() => {
    loadDressSuggestScript().then(() => {
      window.autoInitDressSuggest?.();
    });
  }, []);
  return null;
}
