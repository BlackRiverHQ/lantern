import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lantern | Dashboard",
  description:
    "Every liquidation on chain, the bond behind the price it used, and the held bonuses anyone can settle.",
  applicationName: "Lantern",
  authors: [{ name: "Lantern" }],
  robots: { index: true },
};

export const viewport: Viewport = { themeColor: "#191919", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
