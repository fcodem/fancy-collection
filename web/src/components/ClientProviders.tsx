"use client";

import { ToastProvider } from "@/components/ui/Toast";
import { useGlobalUppercaseInputs } from "@/hooks/useGlobalUppercaseInputs";

function GlobalInputBehavior() {
  useGlobalUppercaseInputs();
  return null;
}

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <GlobalInputBehavior />
      {children}
    </ToastProvider>
  );
}
