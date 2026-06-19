"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    initDressNameSuggest?: (input: HTMLInputElement, options?: Record<string, unknown>) => void;
    autoInitDressSuggest?: () => void;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadDressSuggestScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.initDressNameSuggest) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-dress-suggest="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (window.initDressNameSuggest) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "/js/dress-suggest.js";
    script.async = true;
    script.dataset.dressSuggest = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load dress suggest"));
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export function useDressSuggestScript(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadDressSuggestScript()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
