import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { LendingDirectory } from "@/components/lending/LendingDirectory";
import { BRAND } from "@/lib/brand";
import { getLendingMarkets } from "@/server/lending";
import "@/styles/lending.css";

export const metadata: Metadata = { title: `Lending · ${BRAND.name}` };
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
