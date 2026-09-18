import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { EarningsCalculator } from "@/components/calculator/EarningsCalculator";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Fee calculator · ${BRAND.name}`,
  description: "What a USDG amount would have earned in each vault at the observed fee rate. Past pool fees read from the chain, not a forecast.",
};

export default function CalculatorPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">Fee calculator</p>
              <h1>
                What would you <em className="serif">have earned?</em>
              </h1>
            </div>
            <p className="masthead-intro">
              Pick an amount and a vault. The calculator applies the fee rate the vault actually earned over its observed window, and shows the vault&apos;s
              lifetime fees for scale. It looks backwards on purpose.
            </p>
          </div>
        </div>
      </section>
      <EarningsCalculator />
      <SiteFooter />
    </main>
  );
}
