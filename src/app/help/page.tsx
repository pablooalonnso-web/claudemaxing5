import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { HelpCenter } from "@/components/help/HelpCenter";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("help");
  return { title: `${t("meta.title")} · ${BRAND.name}` };
}

export default function HelpPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <HelpCenter />
      <SiteFooter />
    </main>
  );
}
