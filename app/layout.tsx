import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Skylark BI Agent",
  description: "Ask business questions across Skylark's monday.com boards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
