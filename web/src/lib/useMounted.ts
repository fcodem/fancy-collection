"use client";

import { useEffect, useState } from "react";

/** True only after the client has mounted — use to defer browser-only UI/state. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
