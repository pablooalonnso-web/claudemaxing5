import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BasketExit } from "@/components/strategies/BasketExit";
import { BasketStrategy } from "@/components/strategies/BasketStrategy";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";

export const metadata: Metadata = {
  title: `Volatile basket · ${BRAND.name}`,
  description: "One USDG deposit spread across the top vaults by realized fee APR. You sign every step; rotation is suggested, never automatic.",
};

export default function BasketPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">
                <Link href="/strategies" className="masthead-back">
                  <ArrowLeft size={13} aria-hidden="true" /> Strategies
                </Link>
              </p>
              <h1>
                The top vaults, <em className="serif">in one deposit.</em>
              </h1>
            </div>
            <p className="masthead-intro">
              The basket ranks the 18 vaults by realized fee APR, splits your USDG across the top ones and walks you through each deposit. The
              positions are yours, in your wallet, exactly as if you had opened them one by one.
            </p>
          </div>
        </div>
      </section>
      <div className="strategies-page">
        <BasketStrategy />
        <BasketExit />
        <section className="strategy-notes" aria-label="How the basket works">
          <div>
            <h3>What it does</h3>
            <p>Ranks open vaults by their observed 24h fee APR, ignores vaults under $1,000, splits the amount evenly and builds one router deposit per vault with the same quote and simulation the vault page uses.</p>
          </div>
          <div>
            <h3>What it does not do</h3>
            <p>It does not hold your funds, does not rotate on its own and does not promise a return. Fee APR is an observation of past pool fees. Every position keeps full Stock Token price exposure.</p>
          </div>
          <div>
            <h3>Costs</h3>
            <p>One approval and one deposit per vault, each paid in gas on Robinhood Chain. No strategy fee. The vault fee split (70 / 20 / 10) applies as usual.</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
