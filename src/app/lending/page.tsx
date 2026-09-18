import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { LendingDirectory } from "@/components/lending/LendingDirectory";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import { getLendingMarkets } from "@/server/lending";
import "@/styles/lending.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("lending");
  return { title: `${t("meta.title")} · ${BRAND.name}` };
}
export const dynamic = "force-dynamic";

export default async function LendingPage() {
  const markets = await getLendingMarkets().catch(() => null);
  return (
    <div className="app-page">
      <SiteHeader />
      <LendingDirectory initial={markets?.data ?? null} />
      <SiteFooter />
    </div>
  );
}
