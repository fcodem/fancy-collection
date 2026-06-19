"use client";

import { ToastProvider } from "@/components/ui/Toast";
import DressSuggestBootstrap from "@/components/DressSuggestBootstrap";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DressSuggestBootstrap />
      {children}
    </ToastProvider>
  );
}
