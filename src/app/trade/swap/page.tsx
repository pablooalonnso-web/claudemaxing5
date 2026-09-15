import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SwapTicket, TradeShell } from "@/components/trade/SwapTicket";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Trade · ${BRAND.name}` };

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
