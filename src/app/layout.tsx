import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "COPA ALMA Entry System",
    template: "%s | COPA ALMA",
  },
  description: "COPA ALMA tournament entry and administration system.",
  manifest: "/manifest.webmanifest?v=20260527",
  openGraph: {
    title: "COPA ALMA Entry System",
    description: "COPA ALMA tournament entry and administration system.",
    siteName: "COPA ALMA",
    images: [
      {
        url: "/og-logo.png?v=20260527",
        width: 1200,
        height: 630,
        alt: "COPA ALMA",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "COPA ALMA Entry System",
    description: "COPA ALMA tournament entry and administration system.",
    images: ["/og-logo.png?v=20260527"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg?v=20260527", type: "image/svg+xml" },
      { url: "/favicon-32x32.png?v=20260527", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png?v=20260527", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico?v=20260527", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=20260527",
    apple: [
      {
        url: "/apple-touch-icon.png?v=20260527",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
