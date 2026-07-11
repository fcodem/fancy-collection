import type { Metadata, Viewport } from "next";
import AuthShellGate from "@/components/AuthShellGate";
import ClientProviders from "@/components/ClientProviders";
import SessionHeartbeat from "@/components/SessionHeartbeat";
import { BRAND_APP_TITLE, BRAND_FULL_NAME, BRAND_HOUSE_TAGLINE, BRAND_THEME_COLOR } from "@/lib/branding";
import "./globals.css";

const APP_NAME = BRAND_APP_TITLE;

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: `${BRAND_FULL_NAME} — ${BRAND_HOUSE_TAGLINE}. Staff rental management.`,
  applicationName: APP_NAME,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: BRAND_THEME_COLOR,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content={BRAND_THEME_COLOR} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="stylesheet" href="/css/style.css" />
      </head>
      <body suppressHydrationWarning>
        <ClientProviders>
          <SessionHeartbeat />
          <AuthShellGate>{children}</AuthShellGate>
        </ClientProviders>
      </body>
    </html>
  );
}
