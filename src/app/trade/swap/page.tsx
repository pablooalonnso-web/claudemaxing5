import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SwapTicket, TradeShell } from "@/components/trade/SwapTicket";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("trade");
  return { title: `${t("meta.title")} · ${BRAND.name}` };
}

export default function SwapPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <TradeShell>
        <SwapTicket />
      </TradeShell>
      <SiteFooter />
    </main>
  );
}
