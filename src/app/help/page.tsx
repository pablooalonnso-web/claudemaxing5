import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { HelpCenter } from "@/components/help/HelpCenter";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Help center · ${BRAND.name}` };

export default function HelpPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <HelpCenter />
      <SiteFooter />
    </main>
  );
}
