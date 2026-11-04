import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/site";
import { THEME_BOOT_SCRIPT, themeCss } from "@/lib/themes";
import { LEGACY_POLYFILLS } from "@/lib/legacy-polyfills";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0C0B10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Shared by every route; the docs (/aniflow-doc) and the library set their own titles and SEO
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AniFlow",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The boot script sets data-theme before React hydrates
    <html lang="en" className="dark bg-black" suppressHydrationWarning>
      <head>
        {/* First of all: older Smart TV browsers need these before any app code runs */}
        <script dangerouslySetInnerHTML={{ __html: LEGACY_POLYFILLS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap"
        />
      </head>
      <body className="min-h-screen bg-black text-white font-product-sans antialiased">
        {children}
      </body>
    </html>
  );
}
