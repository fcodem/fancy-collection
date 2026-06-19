import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fancy Collection – Rental Management",
  description: "Cloth rental management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/css/style.css" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" defer />
        <script src="/js/dress-suggest.js" defer />
      </head>
      <body>{children}</body>
    </html>
  );
}
