import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { anybody, dmSans, nanumPen, spaceMono } from "@/lib/fonts";
import { Providers } from "@/components/Providers";
import "./globals.css";
import "@/styles/greptile.css";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: BRAND.name,
  description: BRAND.description,
  openGraph: {
    title: BRAND.name,
    description: BRAND.ogDescription,
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.name,
    description: BRAND.ogDescription,
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${anybody.variable} ${spaceMono.variable} ${nanumPen.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
