import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { anybody, dmSans, nanumPen, spaceMono } from "@/lib/fonts";
import { Providers } from "@/components/Providers";
import { I18nProvider } from "@/i18n/client";
import { LOCALE_TAGS } from "@/i18n/config";
import { resolveAll } from "@/i18n";
import { getLocale } from "@/i18n/server";
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = resolveAll(locale);
  return (
    <html lang={LOCALE_TAGS[locale]} className={`${dmSans.variable} ${anybody.variable} ${spaceMono.variable} ${nanumPen.variable}`}>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
