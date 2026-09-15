import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Flag } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { STOCK_NAMES, StockLogo } from "@/components/StockLogo";
import { BrandMark } from "@/components/BrandMark";
import { CtaArt, DepositArt, FeeSplitArt, LendingArt, RangeArt, StackArt, WaveArt } from "@/components/home/Art";
import { FaqAccordion, type FaqItem } from "@/components/home/FaqAccordion";
import { LendingFrame } from "@/components/home/LendingFrame";
import { LiveVaultCards } from "@/components/home/LiveVaultCards";
import { ProtocolFigures } from "@/components/home/ProtocolFigures";
import { BRAND, CHAIN_NAME } from "@/lib/brand";
import { VAULT_PINS } from "@/lib/registry";
import { getLendingMarkets } from "@/server/lending";
import "@/styles/home.css";

export const dynamic = "force-dynamic";

const WALL = VAULT_PINS.slice(0, 16).map((p) => ({ symbol: p.symbol, name: STOCK_NAMES.find((s) => s.symbol === p.symbol)?.name ?? p.symbol }));

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
    a: "Fee APR is a rolling 24-hour estimate: gross fees earned by the position, after the protocol's 30% share, divided by average vault assets. It is an observation of past pool fees, not a forecast, and it starts as a dash until enough samples exist.",
  },
  {
    q: `What does ${BRAND.token} do?`,
    a: `${BRAND.token} is the protocol token. 20% of every claimed fee is reserved in USDG until an audited executor buys ${BRAND.token} and verifiably burns it. At launch 71% of the supply was purchased for the protocol reserve and vests over 90 days.`,
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
  const marquee = Array.from({ length: 20 }, () => "LONG · SHORT · HEDGE");
  return (
    <main className="home">
      <SiteHeader />

      {/* ---------------- hero ---------------- */}
      <section className="home-hero g-rails bg-grid-faint" style={{ color: "var(--border)" }}>
        <Rails />
        <div className="home-hero-art" aria-hidden="true">
          <Image src="/design/hero-halftone.png" alt="" width={905} height={955} priority sizes="(min-width: 768px) 55vw, 80vw" />
        </div>
        <div className="home-hero-inner g-shell">
          <div className="home-hero-top g-reveal">
            <h1>
              Your USDG.
              <br />
              Put to work.
            </h1>
          </div>
          <div className="home-hero-bottom g-reveal g-reveal-2">
            <p>Managed liquidity vaults for tokenized stocks. Deposit USDG, provide liquidity, and share in the trading fees.</p>
            <div className="hex-group">
              <Link className="hex-outline hex-notch hex-md hex-slate" href="/docs">
                How it works
              </Link>
              <Link className="hex hex-md hex-green" href="/vaults">
                Start now
              </Link>
            </div>
            <Link className="home-hero-link g-label-xs" href="/docs#contracts">
              <span>verify the contracts</span> <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <hr className="g-hr" />
      <PillRow label={`${VAULT_PINS.length} Stock Token vaults on ${CHAIN_NAME}`} />
      <div className="home-wall g-shell">
        {WALL.map((t) => (
          <Link key={t.symbol} href="/vaults" className="home-wall-cell">
            <StockLogo symbol={t.symbol} size={26} />
            <span>{t.name}</span>
          </Link>
        ))}
      </div>

      {/* ---------------- quote ---------------- */}
      <section className="home-quote t-fog g-rails" style={{ color: "var(--border)" }}>
        <Rails />
        <div className="home-quote-inner g-shell">
          <Flag size={20} strokeWidth={1.5} aria-hidden="true" />
          <h2 className="c-slate">
            “No deposit fee, no withdrawal fee, no management fee. <em>We earn only when the vault earns</em> — and every claimed fee is
            split onchain, where anyone can check it.”
          </h2>
          <div className="home-quote-author">
            <span className="home-quote-avatar" aria-hidden="true">
              <BrandMark size={48} circle accent="#28E99F" petal="#EEEEEE" disc="#3D3B4F" />
            </span>
            <span>
              <p className="home-quote-role">Fee policy @ {BRAND.name}</p>
              <p className="home-quote-name mono">70 / 10 / 20 split</p>
            </span>
          </div>
          <Link className="hex hex-md hex-slate" href="/docs#flywheel">
            Read the fee policy
          </Link>
        </div>
      </section>

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
              <Link className="hex hex-md hex-lavender" href="/vaults">
                Learn more
              </Link>
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
                { n: "03", t: "Fees are claimed and split", d: `70% compounds into the position, 10% runs the protocol and 20% is reserved to buy back and burn ${BRAND.token}.`, Art: FeeSplitArt },
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
          <PillRow label="Three vaults earning right now." tint="#FFCFFE" />
          <div className="g-section">
            <LiveVaultCards />
            <div className="home-center-cta">
              <Link className="hex hex-md hex-lavender hex-mono" href="/vaults">
                See all vaults
              </Link>
            </div>
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

      {/* ---------------- your stack ---------------- */}
      <div className="t-bg">
        <div className="div-ruler div-ruler-flip" style={{ color: "var(--border)" }} aria-hidden="true" />
        <div className="g-section g-head-split">
          <div className="g-tight">
            <span className="g-label">[ YOUR STACK ]</span>
            <h2>Built on {CHAIN_NAME}.</h2>
            <p className="g-lede">Canonical Stock Tokens, Uniswap pools, Chainlink feeds and USDG. {BRAND.name} is the vault layer that ties them together.</p>
          </div>
          <div>
            <Link className="hex hex-md hex-slate" href="/docs">
              Learn more
            </Link>
          </div>
        </div>
        <div className="div-ruler" style={{ color: "var(--border)" }} aria-hidden="true" />
        <PillRow label={`Ways ${BRAND.name} plugs into your wallet`} tint="#DAFF01" />
        <div className="g-columns g-shell" style={{ color: "var(--border)" }}>
          <div className="div-double-solid-v" aria-hidden="true" />
          <div className="g-columns-inner">
            <div className="g-columns-lines" aria-hidden="true">
              <div className="div-double-solid-v" />
              <div className="div-double-solid-v" />
              <div className="div-double-solid-v" />
            </div>
            <div className="div-double-dashed" aria-hidden="true" />
            <div className="g-grid home-stack c-slate">
              {[
                { n: "01", t: "Robinhood Chain", d: "An Arbitrum-stack L2 where canonical Stock Tokens and USDG settle.", src: "/brands/robinhood-mark.svg", tint: "#C5FFD6" },
                { n: "02", t: "Uniswap pools", d: "V3 and V4 pools hold each vault's concentrated liquidity position.", src: "/brands/uniswap.svg", tint: "#FFCFFE" },
                { n: "03", t: "Chainlink feeds", d: "Price and sequencer feeds gate every rebalance, deposit and borrow.", src: "/brands/chainlink.svg", tint: "#D1E5FF" },
                { n: "04", t: "USDG", d: "Every vault and market is denominated in the Global Dollar.", src: "/brands/usdg.png", tint: "#ECFFA3" },
              ].map((s) => (
                <div key={s.n} className="col-3">
                  <div className="g-frame" style={{ color: "var(--slate)" }}>
                    <div className="div-hatch" />
                    <div className="g-frame-row">
                      <div className="div-hatch-v" />
                      <div className="g-frame-body">
                        <div className="g-frame-img">
                          <StackArt src={s.src} label={s.t} tint={s.tint} />
                        </div>
                      </div>
                      <div className="div-hatch-v" />
                    </div>
                    <div className="div-hatch" />
                  </div>
                  <div className="g-frame-caption">
                    <span className="g-label-xs">{s.n}</span>
                    <p className="g-sub-xs">{s.t}</p>
                    <p className="g-body">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="div-double-dashed" aria-hidden="true" />
          </div>
          <div className="div-double-solid-v" aria-hidden="true" />
        </div>
      </div>

      <hr className="g-hr" />

      {/* ---------------- strategies band ---------------- */}
      <section className="home-band t-bg">
        <div className="home-band-lines home-band-lines-left" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="home-band-lines home-band-lines-right" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="div-hatch" style={{ color: "rgba(88,130,255,.2)", position: "relative", zIndex: 2 }} aria-hidden="true" />
        <div className="home-band-marquee" aria-hidden="true">
          <div className="g-marquee">
            {marquee.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
        <div className="home-band-body">
          <div className="home-band-wave" aria-hidden="true">
            <WaveArt />
          </div>
          <div className="home-band-sphere" aria-hidden="true">
            <Image src="/design/sphere.svg" alt="" width={200} height={170} />
          </div>
          <div className="g-section g-head g-center home-band-copy">
            <span className="g-label">[ INTRODUCING STRATEGIES ]</span>
            <h2>Managed positions that combine both.</h2>
            <p className="g-lede">A volatile basket of the highest-earning vaults, and a delta-neutral strategy that holds a vault position for its fees while a short elsewhere aims to offset the price. Deposits open only after review.</p>
            <Link className="hex hex-md hex-slate" href="/strategies" style={{ "--hex-fg": "var(--lime)" } as React.CSSProperties}>
              Preview strategies
            </Link>
          </div>
        </div>
        <div className="home-band-marquee home-band-marquee-bottom" aria-hidden="true">
          <div className="g-marquee">
            {marquee.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>
        <div className="div-hatch" style={{ color: "rgba(88,130,255,.2)", position: "relative", zIndex: 2 }} aria-hidden="true" />
      </section>

      <hr className="g-hr" />
      <HatchBand />
      <hr className="g-hr" />

      {/* ---------------- guarded ---------------- */}
      <section className="t-bg">
        <div className="g-section g-head-split">
          <div className="g-tight">
            <h2>Guarded by default.</h2>
            <p className="g-lede">Oracle checks, caps and a guardian pause on every product. Built for people who read the contracts.</p>
          </div>
          <div>
            <Link className="hex hex-md hex-slate" href="/docs#safeguards">
              Learn more
            </Link>
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
                  <div className="home-guard-card bg-silver bg-dot-seafoam">
                    <span className="mono">{c.n}</span>
                    <h3>{c.t}</h3>
                    <p>{c.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="div-double-solid-v" aria-hidden="true" />
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
              <Link className="hex hex-md hex-lime" href="/vaults">
                Start now
              </Link>
            </div>
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
