import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WalletPortfolio } from "@/components/portfolio/WalletPortfolio";
import { BRAND } from "@/lib/brand";
import "@/styles/portfolio.css";

export const metadata: Metadata = { title: `Portfolio · ${BRAND.name}` };

export default function PortfolioPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead masthead-1360">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">Portfolio &amp; wallet</p>
              <h1>
                Your money, <em className="serif">in one place.</em>
              </h1>
            </div>
            <p className="masthead-intro">
              View your wallet balances and send ETH or tokens to another wallet. Your vault positions stay in view; manage deposits and redemptions
              on each vault&apos;s page.
            </p>
          </div>
        </div>
      </section>
      <WalletPortfolio />
      <SiteFooter />
    </main>
  );
}
