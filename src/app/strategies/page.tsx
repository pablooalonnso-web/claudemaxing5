import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Lock, Plus } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StockLogo } from "@/components/StockLogo";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";

export const metadata: Metadata = { title: `Strategies · ${BRAND.name}` };

const BASKET = ["MSTR", "PLTR", "GME", "TSLA", "NVDA", "AMD"];

export default function StrategiesPage() {
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">Strategies</p>
              <h1>
                Vaults and lending, <em className="serif">combined.</em>
              </h1>
            </div>
            <p className="masthead-intro">Deposit USDG once and let a strategy run the vault and lending positions for you. Two are in design. None are live.</p>
            <div className="masthead-aside">
              <span className="strategy-status">
                <Lock size={12} strokeWidth={1.6} aria-hidden="true" /> Coming soon
              </span>
            </div>
          </div>
        </div>
      </section>
      <div className="strategies-page">
        <div className="strategy-grid">
          <article className="strategy-card">
            <header className="strategy-card-head">
              <div>
                <p className="eyebrow">01 · Volatile</p>
                <h2>The highest-earning vaults, in one deposit.</h2>
              </div>
              <span className="strategy-status">
                <Lock size={12} strokeWidth={1.6} aria-hidden="true" /> Coming soon
              </span>
            </header>
            <div className="strategy-visual strategy-basket" aria-label="Example Stock Tokens in the basket">
              <div className="strategy-basket-marks">
                {BASKET.map((s, i) => (
                  <span key={s} style={{ zIndex: BASKET.length - i }}>
                    <StockLogo symbol={s} size={44} />
                  </span>
                ))}
              </div>
              <div className="strategy-basket-copy">
                <b>A basket of the top vaults by realized fee APR</b>
                <span>Rotates as the rankings change. Example markets shown.</span>
              </div>
            </div>
            <p className="strategy-lede">
              One USDG deposit spread across the vaults earning the most trading fees right now. The strategy moves between markets as the
              rankings change, so you hold the top of the vault table without choosing a single Stock Token.
            </p>
            <dl className="strategy-facts">
              <div>
                <dt>Earns</dt>
                <dd>Trading fees from several Stock Token markets at once</dd>
              </div>
              <div>
                <dt>Exposure</dt>
                <dd>Full Stock Token price exposure across the basket, so value moves with the markets it holds</dd>
              </div>
              <div>
                <dt>Deposit</dt>
                <dd className="strategy-deposit">
                  <Image src="/brands/usdg.png" alt="" width={22} height={22} /> USDG
                </dd>
              </div>
            </dl>
            <footer className="strategy-card-foot">
              <span className="strategy-closed">Deposits closed · no terms published</span>
              <Link href="/vaults">
                See the vaults it draws from <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </article>
          <article className="strategy-card">
            <header className="strategy-card-head">
              <div>
                <p className="eyebrow">02 · Delta-neutral</p>
                <h2>Vault fees, with a price hedge.</h2>
              </div>
              <span className="strategy-status">
                <Lock size={12} strokeWidth={1.6} aria-hidden="true" /> Coming soon
              </span>
            </header>
            <div className="strategy-visual strategy-neutral" aria-label="How the delta-neutral strategy is built">
              <div className="strategy-side strategy-long">
                <span className="strategy-side-label">
                  <ArrowUpRight size={13} aria-hidden="true" /> Long
                </span>
                <span className="strategy-side-marks">
                  <StockLogo symbol="TSLA" size={36} />
                  <span className="strategy-usdg">
                    <Image alt="USDG" width={36} height={36} src="/brands/usdg.png" />
                  </span>
                </span>
                <b>LP position in the TSLA / USDG vault</b>
                <span>Earns trading fees. Gains when TSLA rises.</span>
              </div>
              <div className="strategy-combine" aria-hidden="true">
                <Plus size={16} strokeWidth={1.6} />
              </div>
              <div className="strategy-side strategy-short">
                <span className="strategy-side-label">
                  <ArrowDownRight size={13} aria-hidden="true" /> Short
                </span>
                <span className="strategy-side-marks">
                  <StockLogo symbol="TSLA" size={36} />
                </span>
                <b>Short TSLA on an external venue</b>
                <span>Gains when TSLA falls. Offsets the long side.</span>
              </div>
              <div className="strategy-result">The hedge aims to reduce Stock Token price exposure. Returns still depend on vault fees, hedge costs and market conditions.</div>
            </div>
            <p className="strategy-lede">
              Delta-neutral means the position is designed to reduce exposure to Stock Token price moves. The long side is an ordinary vault
              position, so it keeps earning fees. The short side aims to offset its changing price exposure and needs ongoing adjustment. Starting
              markets in design:{" "}
              <span className="strategy-inline-mark">
                <StockLogo symbol="TSLA" size={18} />
                TSLA and{" "}
              </span>
              <span className="strategy-inline-mark">
                <StockLogo symbol="MSTR" size={18} />
                MSTR
              </span>
              , each paired with USDG.
            </p>
            <dl className="strategy-facts">
              <div>
                <dt>Earns</dt>
                <dd>Vault trading fees</dd>
              </div>
              <div>
                <dt>Exposure</dt>
                <dd>Aims for none to the Stock Token price. Hedge costs, borrow interest and basis between venues still apply.</dd>
              </div>
              <div>
                <dt>Deposit</dt>
                <dd className="strategy-deposit">
                  <Image src="/brands/usdg.png" alt="" width={22} height={22} /> USDG
                </dd>
              </div>
            </dl>
            <footer className="strategy-card-foot">
              <span className="strategy-closed">Deposits closed · no terms published</span>
              <Link href="/lending">
                See the lending it borrows on <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </article>
        </div>
        <section className="strategy-notes" aria-label="About strategies">
          <div>
            <h3>What a strategy is</h3>
            <p>
              A separate contract that holds positions in {BRAND.name} vaults and lending markets on your behalf, within limits fixed at
              deployment. You hold a share of the strategy, not the underlying positions.
            </p>
          </div>
          <div>
            <h3>What it is not</h3>
            <p>
              Not a stablecoin, not principal-protected, and not a promise of return. Hedges can fail, borrow rates move, and liquidation rules
              apply to the strategy&apos;s own positions.
            </p>
          </div>
          <div>
            <h3>Before any strategy opens</h3>
            <p>
              Published terms and limits, an independent review of its contracts, venue evidence for every hedge, and a capped launch with a
              guardian pause. Nothing on this page is live.
            </p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
