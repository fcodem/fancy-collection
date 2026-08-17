"use client";

import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { useBlockWheelValueChange } from "@/hooks/useBlockWheelValueChange";
import { useGlobalUppercaseInputs } from "@/hooks/useGlobalUppercaseInputs";
import { installChunkLoadRecovery } from "@/lib/chunkLoadRecovery";

function GlobalInputBehavior() {
  useGlobalUppercaseInputs();
  useBlockWheelValueChange();
  return null;
}

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => installChunkLoadRecovery(), []);

  return (
    <ToastProvider>
      <GlobalInputBehavior />
      {children}
    </ToastProvider>
  );
}
