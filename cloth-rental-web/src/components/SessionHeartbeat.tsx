"use client";

import { useEffect } from "react";

export default function SessionHeartbeat() {
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/session/check").catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, []);
  return null;
}
