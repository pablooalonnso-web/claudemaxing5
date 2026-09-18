import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { LendingMarketWorkspace } from "@/components/lending/LendingMarketWorkspace";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import { findLendingMarket, LENDING_MARKETS } from "@/lib/registry";
import { getLendingMarkets } from "@/server/lending";
import "@/styles/lending-market.css";

type Params = { params: Promise<{ market: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { market } = await params;
  const pin = findLendingMarket(market);
  if (!pin) return { title: BRAND.name };
  const t = await getT("lending");
  return { title: `${t("meta.marketTitle", { symbol: pin.symbol })} · ${BRAND.name}` };
}

export function generateStaticParams() {
  return LENDING_MARKETS.map((m) => ({ market: m.slug }));
}

export default async function LendingMarketPage({ params }: Params) {
  const { market } = await params;
  const pin = findLendingMarket(market);
  if (!pin) notFound();
  const all = await getLendingMarkets().catch(() => null);
  const row = all?.data.find((r) => r.pinId === pin.id) ?? null;
  return (
    <main className="app-page">
      <SiteHeader />
      <Suspense fallback={null}>
        <LendingMarketWorkspace pin={pin} initial={row} />
      </Suspense>
      <SiteFooter />
    </main>
  );
}
