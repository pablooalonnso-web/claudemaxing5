import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ZapFlow } from "@/components/zap/ZapFlow";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";

export const metadata: Metadata = {
  title: `Zap · ${BRAND.name}`,
  description: "Deposit into any vault starting from ETH, USDG or a Stock Token. The swap and the deposit run one after another; you sign each step.",
};

export default function ZapPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">Zap</p>
              <h1>
                Any token, <em className="serif">straight into a vault.</em>
              </h1>
            </div>
            <p className="masthead-intro">
              Start from ETH, USDG or any Stock Token in your wallet. Zap swaps it to USDG through the aggregator and deposits into the vault you pick, one
              signature after another. The position lands in your wallet like any other deposit.
            </p>
          </div>
        </div>
      </section>
      <div className="strategies-page">
        <ZapFlow />
        <section className="strategy-notes" aria-label="How zap works">
          <div>
            <h3>What it does</h3>
            <p>Quotes the swap on KyberSwap and the deposit on the vault router before you sign anything, then runs approval, swap, approval and deposit in order. If a step fails you retry from that step.</p>
          </div>
          <div>
            <h3>What to expect</h3>
            <p>Two to four signatures depending on the token. Aggregator slippage is 0.5%. The USDG that actually arrives from the swap is what gets deposited, so the share estimate can move slightly.</p>
          </div>
          <div>
            <h3>What it is not</h3>
            <p>Not a contract holding your funds and not a promise of return. Vault shares carry full Stock Token price exposure and the fee APR shown is an observation, not a forecast.</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
