import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { STOCK_NAMES, StockLogo } from "@/components/StockLogo";
import { CtaArt, DepositArt, FeeSplitArt, LendingArt, RangeArt } from "@/components/home/Art";
import { HeroOrb } from "@/components/home/HeroOrb";
import { FaqAccordion, type FaqItem } from "@/components/home/FaqAccordion";
import { LendingFrame } from "@/components/home/LendingFrame";
import { LiveVaultCards } from "@/components/home/LiveVaultCards";
import { ProtocolFigures } from "@/components/home/ProtocolFigures";
import { ContractAddress } from "@/components/ContractAddress";
import { BRAND, CHAIN_NAME } from "@/lib/brand";
import { VAULT_PINS } from "@/lib/registry";
import { getLendingMarkets } from "@/server/lending";
import "@/styles/home.css";

export const dynamic = "force-dynamic";

const WALL = VAULT_PINS.slice(0, 16).map((p) => ({ symbol: p.symbol, href: `/vaults/${encodeURIComponent(p.id)}`, name: STOCK_NAMES.find((s) => s.symbol === p.symbol)?.name ?? p.symbol }));

const STACK = [
  { t: "Robinhood Chain", d: "An Arbitrum-stack L2 where canonical Stock Tokens and USDG settle.", src: "/brands/robinhood-mark.svg" },
  { t: "Uniswap pools", d: "V3 and V4 pools hold each vault's concentrated position.", src: "/brands/uniswap.svg" },
  { t: "Chainlink feeds", d: "Price and sequencer feeds gate every rebalance, deposit and borrow.", src: "/brands/chainlink.svg" },
  { t: "USDG", d: "Every vault and market is denominated in the Global Dollar.", src: "/brands/usdg.png" },
];

const FAQ: FaqItem[] = [
  {
    q: `What is a ${BRAND.name} vault?`,
    a: "An ERC-4626 vault that provides managed liquidity for one USDG / Stock Token pool on Uniswap. You deposit USDG, receive vault shares, and the vault's LP position earns trading fees. Every figure shown is read from the chain.",
  },
  {
    q: "Is my deposit principal-protected?",
    a: "No. Vault shares are not a stablecoin and are not principal-protected. Their value moves with the Stock Token price and with the fees the position earns. Only the amount needed for the position is invested; leftovers return to your wallet.",
  },
  {
    q: "How is fee APR calculated?",
    a: "Fee APR is a rolling 24-hour estimate: gross fees earned by the position, after the 30% that goes to buybacks and the protocol treasury, divided by average vault assets. It is an observation of past pool fees, not a forecast, and it starts as a dash until enough samples exist.",
  },
  {
    q: `What does the ${BRAND.name} token do?`,
    a: `It is the protocol token. 20% of every claimed fee is reserved in USDG until the buyback executor buys the token and verifiably burns it.`,
  },
  {
    q: "Which wallets work?",
    a: "Any injected EIP-1193 wallet such as MetaMask or Rabby. The site adds Robinhood Chain to your wallet and switches to it automatically when you connect.",
  },
  {
    q: "What happens when the stock market is closed?",
    a: "Chainlink price and sequencer feeds must be fresh before any rebalance or borrow. When feeds are stale, deposits and borrows wait instead of guessing; redemptions still work.",
  },
  {
    q: "Where can I verify the contracts?",
    a: (
      <>
        Every vault, router, position and lending market address is listed in the{" "}
        <Link href="/docs#contracts">contracts section of the docs</Link> with links to the Robinhood Chain explorer.
      </>
    ),
  },
];

function Rails() {
  return (
    <span className="g-rail-marks" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function PillRow({ label, tint }: { label: string; tint?: string }) {
  return (
    <div>
      <hr className="g-hr g-hr-soft" />
      <div className="g-pill-row g-shell">
        <div className="div-plus-sm" aria-hidden="true" />
        <span className="g-pill" style={tint ? ({ "--pill-bg": tint } as React.CSSProperties) : undefined}>
          <span>{label}</span>
        </span>
        <div className="div-plus-sm" aria-hidden="true" />
      </div>
      <hr className="g-hr g-hr-soft" />
    </div>
  );
}

function RiskNote({ tone }: { tone?: "dark" | "cta" }) {
  return (
    <p className={`home-risk${tone ? ` home-risk-${tone}` : ""}`}>
      Vault shares move with the Stock Token price and are not principal-protected. Fee APR is a 24h observation, not a forecast.{" "}
      <Link href="/docs#contracts">Verify the contracts</Link>
    </p>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="home-more" href={href}>
      <span>{children}</span> <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  );
}

function HatchBand() {
  return (
    <div className="hatch-band g-rails" style={{ color: "var(--border)" }} aria-hidden="true">
      <Rails />
    </div>
  );
}

export default async function HomePage() {
  const lending = await getLendingMarkets().catch(() => null);
  const market = lending?.data[0] ?? null;
  return (
    <main className="home">
      <SiteHeader />

      {/* ---------------- hero ---------------- */}
      <section className="home-hero g-rails bg-grid-faint" style={{ color: "var(--border)" }}>
        <Rails />
        <div className="home-hero-art" aria-hidden="true">
          <HeroOrb className="home-hero-orb" size={720} />
        </div>
        <div className="home-hero-inner g-shell">
          <div className="home-hero-top g-reveal">
            <h1>
              One vault
              <br className="home-hero-br-m" /> per stock.
              <br />
              Fees split
              <br className="home-hero-br-m" /> onchain.
            </h1>
          </div>
          <div className="home-hero-art-mobile" aria-hidden="true">
            <HeroOrb className="home-hero-orb" size={360} />
          </div>
          <div className="home-hero-bottom g-reveal g-reveal-2">
            <p>Managed liquidity vaults for tokenized stocks on {CHAIN_NAME}. Deposit USDG, the vault runs the position, and you share in the trading fees.</p>
            <div className="hex-group">
              <Link className="hex-outline hex-notch hex-md hex-slate" href="/docs">
                How it works
              </Link>
              <Link className="hex hex-md hex-green" href="/vaults">
                Start now
              </Link>
            </div>
            <RiskNote />
            <ContractAddress />
          </div>
        </div>
      </section>

      <hr className="g-hr" />
      <PillRow label={`${VAULT_PINS.length} vaults, one per stock`} />
      <div className="home-wall g-shell">
        {WALL.map((t) => (
          <Link key={t.symbol} href={t.href} className="home-wall-cell" aria-label={`${t.name} vault`}>
            <StockLogo symbol={t.symbol} size={26} />
            <span>{t.name}</span>
          </Link>
        ))}
      </div>
      <div className="home-wall-gap" aria-hidden="true" />

      {/* ---------------- vaults (dark) ---------------- */}
      <div className="t-slate home-dark">
        <div className="line-fade" aria-hidden="true" />
        <section className="g-rails" style={{ color: "rgba(255,207,254,.35)" }}>
          <Rails />
          <div className="g-section g-head-split">
            <div className="g-tight">
              <span className="g-label c-lavender">[ VAULTS ]</span>
              <h2 className="c-lavender">How {BRAND.name} vaults earn</h2>
              <p className="g-lede c-lavender">
                Each vault holds one concentrated liquidity position for a single USDG / Stock Token pool, keeps it centred on the Chainlink
                price, and lets the trading fees compound inside the vault.
              </p>
            </div>
            <div>
              <MoreLink href="/docs">Read how vaults earn</MoreLink>
            </div>
          </div>
        </section>
        <div className="div-ruler" style={{ color: "rgba(255,207,254,.3)" }} aria-hidden="true" />
        <section className="g-rails" style={{ color: "rgba(255,207,254,.35)" }}>
          <Rails />
          <PillRow label="How it works" tint="#FFCFFE" />
          <div className="g-section">
            <div className="home-steps">
              {[
                { n: "01", t: "Deposit USDG", d: "The router swaps half into the Stock Token and joins the pool in one transaction. Leftovers return to your wallet.", Art: DepositArt },
                { n: "02", t: "The keeper holds the range", d: "Liquidity stays concentrated around the oracle price; out of range, a rebalance is queued and checked against fresh feeds.", Art: RangeArt },
                { n: "03", t: "Fees are claimed and split", d: `70% compounds into the position, 20% is reserved to buy back and burn the ${BRAND.name} token and 10% goes to the protocol treasury.`, Art: FeeSplitArt },
              ].map(({ n, t, d, Art }) => (
                <div key={n} className="home-step c-lavender">
                  <div className="g-frame" style={{ color: "#FFCFFE" }}>
                    <div className="div-hatch" />
                    <div className="g-frame-row">
                      <div className="div-hatch-v" />
                      <div className="g-frame-body">
                        <div className="g-frame-img" style={{ background: "#3D3B4F" }}>
                          <Art />
                        </div>
                      </div>
                      <div className="div-hatch-v" />
                    </div>
                    <div className="div-hatch" />
                  </div>
                  <div className="g-frame-caption">
                    <span className="g-label-xs c-seafoam">Step {n}</span>
                    <p className="g-sub-xs c-lavender">{t}</p>
                    <p className="g-body c-lavender">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <div className="div-ruler div-ruler-flip" style={{ color: "rgba(255,207,254,.3)" }} aria-hidden="true" />
        <section className="g-rails" style={{ color: "rgba(255,207,254,.35)" }}>
          <Rails />
          <div className="g-section g-head g-center">
            <h2 className="c-lavender">Every vault, live.</h2>
            <p className="g-lede c-lavender">From TVL and fee APR to the exact LP range, every figure below is read from Robinhood Chain.</p>
          </div>
        </section>
        <div className="div-ruler" style={{ color: "rgba(255,207,254,.3)" }} aria-hidden="true" />
        <section className="g-rails" style={{ color: "rgba(255,207,254,.35)" }}>
          <Rails />
          <PillRow label="Live right now" tint="#FFCFFE" />
          <div className="g-section">
            <LiveVaultCards />
            <RiskNote tone="dark" />
          </div>
        </section>
        <div className="line-fade line-fade-up" aria-hidden="true" />
      </div>

      {/* ---------------- lending ---------------- */}
      <section className="t-bg">
        <div className="g-section g-head g-center">
          <span className="g-label c-green">[ LENDING ]</span>
          <h2>Borrow USDG while your vault keeps earning</h2>
          <p className="g-lede">Supply USDG for interest paid by borrowers, or pledge eligible vault shares and borrow against them. Each market has its own cash, its own limits and its own oracle.</p>
        </div>
        <div className="div-ruler" style={{ color: "var(--border)" }} aria-hidden="true" />
        <div className="g-section-sm g-shell">
          <div className="g-grid">
            <div className="col-6">
              <div className="g-frame" style={{ color: "var(--slate)" }}>
                <div className="div-hatch" />
                <div className="g-frame-row">
                  <div className="div-hatch-v" />
                  <div className="g-frame-body">
                    <div className="g-frame-img home-lend-frame">
                      <div>
                        <LendingFrame market={market} />
                      </div>
                    </div>
                  </div>
                  <div className="div-hatch-v" />
                </div>
                <div className="div-hatch" />
              </div>
              <div className="g-frame-caption">
                <span className="g-label-xs">[ SUPPLY ]</span>
                <p className="g-sub-sm">Lenders earn what borrowers pay</p>
                <p className="g-body">Supply USDG to a market and earn the borrow rate, net of the reserve factor. Rates follow utilisation and update every block.</p>
                <Link className="hex hex-md hex-slate" href={market ? `/lending/${market.pin.slug}` : "/lending"}>
                  Supply USDG
                </Link>
              </div>
            </div>
            <div className="col-6">
              <div className="g-frame" style={{ color: "var(--slate)" }}>
                <div className="div-hatch" />
                <div className="g-frame-row">
                  <div className="div-hatch-v" />
                  <div className="g-frame-body">
                    <div className="g-frame-img">
                      <LendingArt />
                    </div>
                  </div>
                  <div className="div-hatch-v" />
                </div>
                <div className="div-hatch" />
              </div>
              <div className="g-frame-caption">
                <span className="g-label-xs">[ BORROW ]</span>
                <p className="g-sub-sm">Pledge vault shares, keep the fees</p>
                <p className="g-body">Vault shares stay invested while they back your loan. Collateral is valued by the market&apos;s onchain adapter and capped per market.</p>
                <Link className="hex hex-md hex-slate" href="/lending">
                  See markets
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- guarded ---------------- */}
      <section className="t-bg">
        <div className="g-section g-head-split">
          <div className="g-tight">
            <h2>Guarded by default.</h2>
            <p className="g-lede">Oracle checks, caps and a guardian pause on every product. Built for people who read the contracts.</p>
          </div>
          <div>
            <MoreLink href="/docs#safeguards">Read the safeguards</MoreLink>
          </div>
        </div>
        <div className="div-ruler" style={{ color: "rgba(61,59,79,.2)" }} aria-hidden="true" />
        <div className="g-columns g-shell" style={{ color: "rgba(61,59,79,.2)" }}>
          <div className="div-double-solid-v" aria-hidden="true" />
          <div className="g-columns-inner">
            <div className="g-columns-lines" aria-hidden="true">
              <div className="div-double-solid-v" />
              <div className="div-double-solid-v" />
            </div>
            <div className="g-grid home-guard c-slate">
              {[
                { n: "01", t: "Chainlink oracle checks", d: "Price and sequencer feeds must be fresh before any rebalance or borrow." },
                { n: "02", t: "Caps and a guardian pause", d: "Vaults, markets and strategies are each capped, pausable and separately auditable." },
                { n: "03", t: "Verified onchain", d: "Every contract is verified on Blockscout against the reviewed deployment." },
              ].map((c) => (
                <div key={c.n} className="col-4">
                  <div className="home-guard-card">
                    <h3>{c.t}</h3>
                    <p>{c.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="div-double-solid-v" aria-hidden="true" />
        </div>
        <div className="div-ruler" style={{ color: "rgba(61,59,79,.2)" }} aria-hidden="true" />
        <div className="home-stack-row g-shell">
          {STACK.map((item) => (
            <div key={item.t} className="home-stack-item">
              <Image src={item.src} alt="" width={28} height={28} />
              <span>
                <b>{item.t}</b>
                <small>{item.d}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <hr className="g-hr" />

      {/* ---------------- strategies (in review) ---------------- */}
      <section className="home-strat t-bg">
        <PillRow label="Strategies" tint="#D1E5FF" />
        <div className="home-strat-inner g-shell">
          <p>Two managed strategies, a basket of the highest-earning vaults and a delta-neutral position, are in review and take no deposits yet.</p>
          <MoreLink href="/strategies">Preview strategies</MoreLink>
        </div>
      </section>

      <hr className="g-hr" />
      <HatchBand />
      <hr className="g-hr" />

      {/* ---------------- figures ---------------- */}
      <section className="t-bg home-figures-section">
        <div className="home-figures g-shell">
          <div className="home-figures-head">
            <h2>Protocol figures, read onchain.</h2>
            <Link className="hex hex-md hex-slate" href="/status">
              Open system status
            </Link>
          </div>
          <div className="home-figures-grid">
            <ProtocolFigures />
          </div>
        </div>
      </section>

      <hr className="g-hr" />
      <div className="line-fade line-fade-lime" style={{ opacity: 0.55 }} aria-hidden="true" />

      {/* ---------------- FAQ ---------------- */}
      <section className="t-bg home-faq-section">
        <div className="home-faq-lines" aria-hidden="true">
          {[30, 65, 88, 8, 45, 70, 22, 55, 82, 12, 38, 75].map((top, i) => (
            <div key={i}>
              <i style={{ top: `${top}%` }} />
              <i style={{ top: `${(top + 40) % 100}%` }} />
            </div>
          ))}
        </div>
        <div className="g-section home-faq-inner">
          <h2>FAQ</h2>
          <FaqAccordion items={FAQ} />
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="home-cta t-slate">
        <div className="home-cta-ticks" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="div-tick-v" />
          ))}
        </div>
        <div className="home-cta-inner g-grid">
          <div className="col-6 home-cta-copy">
            <h2 className="c-lime">{BRAND.name} is building the yield layer for tokenized stocks so your USDG can get back to work.</h2>
            <div className="hex-group">
              <Link className="hex-outline hex-notch hex-md hex-lime" href="/docs">
                Read the docs
              </Link>
              <Link className="hex hex-md hex-green" href="/vaults">
                Start now
              </Link>
            </div>
            <RiskNote tone="cta" />
          </div>
          <div className="col-6 home-cta-visual">
            <CtaArt />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
