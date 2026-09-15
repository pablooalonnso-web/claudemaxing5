import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, Lock, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { STOCK_NAMES, StockLogo } from "@/components/StockLogo";
import { HomeLendingCard } from "@/components/home/HomeLendingCard";
import { HomeVaultBoard } from "@/components/home/HomeVaultBoard";
import { ProtocolTotals } from "@/components/home/ProtocolTotals";
import { BRAND } from "@/lib/brand";
import { getLendingMarkets } from "@/server/lending";
import "@/styles/home.css";

export const dynamic = "force-dynamic";

const TOUR_TOKENS = STOCK_NAMES.slice(0, 10);

export default async function HomePage() {
  const lending = await getLendingMarkets().catch(() => null);
  const market = lending?.data[0] ?? null;
  return (
    <main className="home-ledger app-page">
      <SiteHeader />
      <section className="masthead home-hero">
        <div className="masthead-inner hero">
          <div className="hero-text">
            <p className="eyebrow">Vaults · Lending · Strategies</p>
            <h1>
              Your USDG. <em className="serif">Put to work.</em>
            </h1>
            <p className="hero-lede">Choose a tokenized stock vault. Deposit USDG, provide liquidity, and share in the trading fees.</p>
            <div className="hero-actions">
              <Link className="btn btn-light" href="/vaults">
                Browse vaults <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
              </Link>
              <a className="btn btn-outline-dark" href="#how-it-works">
                How it works
              </a>
            </div>
            <div className="hero-facts">
              <span>
                <ShieldCheck size={16} strokeWidth={1.5} aria-hidden="true" /> ERC-4626 vault per market
              </span>
              <span>
                <Clock3 size={16} strokeWidth={1.5} aria-hidden="true" /> Fees and interest recorded onchain
              </span>
              <span>
                <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="9" cy="12" r="6" />
                  <circle cx="15" cy="12" r="6" />
                </svg>{" "}
                Canonical Stock Tokens only
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <HomeVaultBoard />
          </div>
        </div>
      </section>

      <section className="wrap home-built" aria-label="Built on">
        <span className="eyebrow">Built on</span>
        <ul>
          <li>
            <Image src="/brands/robinhood-mark.svg" alt="" width={20} height={20} />
            Robinhood
          </li>
          <li>
            <Image src="/brands/uniswap.svg" alt="" width={20} height={20} />
            Uniswap
          </li>
          <li>
            <Image src="/brands/chainlink.svg" alt="" width={20} height={20} />
            Chainlink
          </li>
          <li>
            <Image src="/brands/privy.png" alt="" width={20} height={20} />
            Privy
          </li>
          <li>
            <Image src="/brands/usdg.png" alt="" width={20} height={20} />
            USDG
          </li>
        </ul>
      </section>

      <section className="wrap live-strip" aria-label="Protocol figures">
        <div className="section-topline">
          <span className="eyebrow">Protocol figures</span>
          <span className="mono small muted">Balances updated automatically in the background</span>
        </div>
        <ProtocolTotals />
      </section>

      <section className="wrap home-tour" id="how-it-works">
        <div className="home-tour-text">
          <div className="home-tour-kicker">
            <span className="eyebrow">01 · Vaults</span>
            <span className="tag status-good">Live</span>
          </div>
          <h2>One vault. One Stock Token.</h2>
          <p>
            Each vault provides managed liquidity for a single USDG / Stock Token pool. Deposit USDG, hold a share of that market, and let
            trading fees compound inside the vault. Every figure is read onchain.
          </p>
          <Link className="btn btn-primary" href="/vaults">
            Browse vaults <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
        <div className="home-tour-visual">
          <div className="home-token-grid">
            {TOUR_TOKENS.map((t) => (
              <Link key={t.symbol} className="home-token-tile" href="/vaults">
                <StockLogo symbol={t.symbol} size={36} />
                <b className="mono">{t.symbol}</b>
                <small>{t.name}</small>
              </Link>
            ))}
          </div>
          <p className="fine-print">
            Examples of Stock Tokens with vaults, not a representation of current holdings. Company marks identify the underlying assets and
            do not imply endorsement.
          </p>
        </div>
      </section>

      <section className="wrap home-tour home-tour-flip">
        <div className="home-tour-text">
          <div className="home-tour-kicker">
            <span className="eyebrow">02 · Lending</span>
            <span className="tag status-good">Live</span>
          </div>
          <h2>Borrow USDG while your vault position keeps earning.</h2>
          <p>
            Supply USDG for interest paid by borrowers, or pledge eligible vault shares and borrow against them. Each market has its own cash
            and its own losses, and collateral is valued by the market&apos;s onchain adapter.
          </p>
          <Link className="btn btn-primary" href="/lending">
            See lending markets <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
        <div className="home-tour-visual">
          <HomeLendingCard market={market} />
        </div>
      </section>

      <section className="wrap home-tour">
        <div className="home-tour-text">
          <div className="home-tour-kicker">
            <span className="eyebrow">03 · Strategies</span>
            <span className="tag status-muted">Coming soon</span>
          </div>
          <h2>Managed positions that combine both.</h2>
          <p>
            Two strategies are in design: a volatile basket of the highest-earning vaults, and a delta-neutral strategy that holds a vault
            position for its fees while a short elsewhere aims to offset the Stock Token&apos;s price moves. Deposits open only after review.
          </p>
          <Link className="btn btn-ghost" href="/strategies">
            Preview strategies <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
        <div className="home-tour-visual">
          <div className="home-strategy-card">
            <div className="home-strategy-head">
              <b>Delta-neutral vault yield</b>
              <span className="vault-table-tag">
                <Lock size={11} strokeWidth={1.6} aria-hidden="true" /> Coming soon
              </span>
            </div>
            <div className="home-strategy-sides">
              <span className="home-strategy-side">
                <small className="home-strategy-long">
                  <ArrowUpRight size={13} aria-hidden="true" /> Long
                </small>
                <span className="home-market-marks" aria-hidden="true">
                  <StockLogo symbol="TSLA" size={30} />
                  <Image src="/brands/usdg.png" alt="" width={30} height={30} />
                </span>
                <b>TSLA / USDG vault position</b>
                <em>earns trading fees</em>
              </span>
              <span className="home-strategy-side">
                <small className="home-strategy-short">
                  <ArrowDownRight size={13} aria-hidden="true" /> Short
                </small>
                <span className="home-market-marks" aria-hidden="true">
                  <StockLogo symbol="TSLA" size={30} />
                </span>
                <b>TSLA hedge on an external venue</b>
                <em>aims to offset price exposure</em>
              </span>
            </div>
            <p className="fine-print">No terms, targets or rates are published. Not principal-protected.</p>
          </div>
        </div>
      </section>

      <section className="wrap home-fees" id="fees">
        <div>
          <p className="eyebrow">Where every fee goes</p>
          <h2>We earn only when the vault earns.</h2>
          <p className="section-lede">
            No deposit fee, no withdrawal fee, no management fee. The split applies only to fees actually claimed onchain. Buyback funds stay
            reserved in USDG until an audited executor can buy {BRAND.token} and verifiably burn it.
          </p>
        </div>
        <div className="gallery-fee-split">
          <div>
            <span>Compounds</span>
            <strong>70%</strong>
          </div>
          <div>
            <span>Protocol operations</span>
            <strong>10%</strong>
          </div>
          <div>
            <span>{BRAND.token} buyback reserve</span>
            <strong>20%</strong>
          </div>
        </div>
      </section>

      <section className="wrap home-guard" id="safety">
        <div>
          <div>
            <p className="eyebrow">Guarded by default</p>
            <h2>Oracle checks, caps and a guardian pause on every product.</h2>
            <p>
              Chainlink price and sequencer feeds must be fresh before any rebalance or borrow. Vaults, lending markets and strategies are
              each capped, pausable and separately auditable onchain. Vault shares are not a stablecoin and are not principal-protected.
            </p>
          </div>
          <Link className="btn btn-light" href="/docs">
            Explore the docs <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
