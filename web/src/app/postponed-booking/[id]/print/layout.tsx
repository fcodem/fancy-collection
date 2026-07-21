import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function PostponedPrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="postponed-slip-root">{children}</div>;
}
