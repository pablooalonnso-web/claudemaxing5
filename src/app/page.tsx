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
import { getT } from "@/i18n/server";
import type { TFunction } from "@/i18n";
import "@/styles/home.css";

export const dynamic = "force-dynamic";

const WALL = VAULT_PINS.slice(0, 16).map((p) => ({ symbol: p.symbol, href: `/vaults/${encodeURIComponent(p.id)}`, name: STOCK_NAMES.find((s) => s.symbol === p.symbol)?.name ?? p.symbol }));

const STACK = [
  { key: "robinhood", src: "/brands/robinhood-mark.svg" },
  { key: "uniswap", src: "/brands/uniswap.svg" },
  { key: "chainlink", src: "/brands/chainlink.svg" },
  { key: "usdg", src: "/brands/usdg.png" },
];

function buildFaq(t: TFunction): FaqItem[] {
  const vars = { name: BRAND.name };
  return [
    { q: t("faq.1.q", vars), a: t("faq.1.a", vars) },
    { q: t("faq.2.q", vars), a: t("faq.2.a", vars) },
    { q: t("faq.3.q", vars), a: t("faq.3.a", vars) },
    { q: t("faq.4.q", vars), a: t("faq.4.a", vars) },
    { q: t("faq.5.q", vars), a: t("faq.5.a", vars) },
    { q: t("faq.6.q", vars), a: t("faq.6.a", vars) },
    {
      q: t("faq.7.q", vars),
      a: (
        <>
          {t("faq.7.before")}
          <Link href="/docs#contracts">{t("faq.7.link")}</Link>
          {t("faq.7.after")}
        </>
      ),
    },
  ];
}

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

function RiskNote({ t, tone }: { t: TFunction; tone?: "dark" | "cta" }) {
  return (
    <p className={`home-risk${tone ? ` home-risk-${tone}` : ""}`}>
      {t("risk.body")} <Link href="/docs#contracts">{t("risk.link")}</Link>
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
  const t = await getT("home");
  const lending = await getLendingMarkets().catch(() => null);
  const market = lending?.data[0] ?? null;
  const FAQ = buildFaq(t);
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
              {t("hero.title1a")}
              <br className="home-hero-br-m" /> {t("hero.title1b")}
              <br />
              {t("hero.title2a")}
              <br className="home-hero-br-m" /> {t("hero.title2b")}
            </h1>
          </div>
          <div className="home-hero-art-mobile" aria-hidden="true">
            <HeroOrb className="home-hero-orb" size={360} />
          </div>
          <div className="home-hero-bottom g-reveal g-reveal-2">
            <p>{t("hero.lede", { chain: CHAIN_NAME })}</p>
            <div className="hex-group">
              <Link className="hex-outline hex-notch hex-md hex-slate" href="/docs">
                {t("hero.how")}
              </Link>
              <Link className="hex hex-md hex-green" href="/vaults">
                {t("hero.start")}
              </Link>
            </div>
            <RiskNote t={t} />
            <ContractAddress />
          </div>
        </div>
      </section>

      <hr className="g-hr" />
      <PillRow label={t("wall.pill", { count: VAULT_PINS.length })} />
      <div className="home-wall g-shell">
        {WALL.map((w) => (
          <Link key={w.symbol} href={w.href} className="home-wall-cell" aria-label={t("wall.aria", { name: w.name })}>
            <StockLogo symbol={w.symbol} size={26} />
            <span>{w.name}</span>
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
              <span className="g-label c-lavender">{t("vaults.label")}</span>
              <h2 className="c-lavender">{t("vaults.title", { name: BRAND.name })}</h2>
              <p className="g-lede c-lavender">{t("vaults.lede")}</p>
            </div>
            <div>
              <MoreLink href="/docs">{t("vaults.more")}</MoreLink>
            </div>
          </div>
        </section>
        <div className="div-ruler" style={{ color: "rgba(255,207,254,.3)" }} aria-hidden="true" />
        <section className="g-rails" style={{ color: "rgba(255,207,254,.35)" }}>
          <Rails />
          <PillRow label={t("steps.pill")} tint="#FFCFFE" />
          <div className="g-section">
            <div className="home-steps">
              {[
                { n: "01", title: t("steps.1.title"), d: t("steps.1.desc"), Art: DepositArt },
                { n: "02", title: t("steps.2.title"), d: t("steps.2.desc"), Art: RangeArt },
                { n: "03", title: t("steps.3.title"), d: t("steps.3.desc", { name: BRAND.name }), Art: FeeSplitArt },
              ].map(({ n, title, d, Art }) => (
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
                    <span className="g-label-xs c-seafoam">{t("steps.step", { n })}</span>
                    <p className="g-sub-xs c-lavender">{title}</p>
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
            <h2 className="c-lavender">{t("live.title")}</h2>
            <p className="g-lede c-lavender">{t("live.lede")}</p>
          </div>
        </section>
        <div className="div-ruler" style={{ color: "rgba(255,207,254,.3)" }} aria-hidden="true" />
        <section className="g-rails" style={{ color: "rgba(255,207,254,.35)" }}>
          <Rails />
          <PillRow label={t("live.pill")} tint="#FFCFFE" />
          <div className="g-section">
            <LiveVaultCards />
            <RiskNote t={t} tone="dark" />
          </div>
        </section>
        <div className="line-fade line-fade-up" aria-hidden="true" />
      </div>

      {/* ---------------- lending ---------------- */}
      <section className="t-bg">
        <div className="g-section g-head g-center">
          <span className="g-label c-green">{t("lending.label")}</span>
          <h2>{t("lending.title")}</h2>
          <p className="g-lede">{t("lending.lede")}</p>
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
                <span className="g-label-xs">{t("lending.supply.label")}</span>
                <p className="g-sub-sm">{t("lending.supply.title")}</p>
                <p className="g-body">{t("lending.supply.desc")}</p>
                <Link className="hex hex-md hex-slate" href={market ? `/lending/${market.pin.slug}` : "/lending"}>
                  {t("lending.supply.cta")}
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
                <span className="g-label-xs">{t("lending.borrow.label")}</span>
                <p className="g-sub-sm">{t("lending.borrow.title")}</p>
                <p className="g-body">{t("lending.borrow.desc")}</p>
                <Link className="hex hex-md hex-slate" href="/lending">
                  {t("lending.borrow.cta")}
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
            <h2>{t("guard.title")}</h2>
            <p className="g-lede">{t("guard.lede")}</p>
          </div>
          <div>
            <MoreLink href="/docs#safeguards">{t("guard.more")}</MoreLink>
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
                { n: "01", title: t("guard.1.title"), d: t("guard.1.desc") },
                { n: "02", title: t("guard.2.title"), d: t("guard.2.desc") },
                { n: "03", title: t("guard.3.title"), d: t("guard.3.desc") },
              ].map((c) => (
                <div key={c.n} className="col-4">
                  <div className="home-guard-card">
                    <h3>{c.title}</h3>
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
            <div key={item.key} className="home-stack-item">
              <Image src={item.src} alt="" width={28} height={28} />
              <span>
                <b>{t(`stack.${item.key}.title`)}</b>
                <small>{t(`stack.${item.key}.desc`)}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <hr className="g-hr" />

      {/* ---------------- strategies (in review) ---------------- */}
      <section className="home-strat t-bg">
        <PillRow label={t("strat.pill")} tint="#D1E5FF" />
        <div className="home-strat-inner g-shell">
          <p>{t("strat.body")}</p>
          <MoreLink href="/strategies">{t("strat.more")}</MoreLink>
        </div>
      </section>

      <hr className="g-hr" />
      <HatchBand />
      <hr className="g-hr" />

      {/* ---------------- figures ---------------- */}
      <section className="t-bg home-figures-section">
        <div className="home-figures g-shell">
          <div className="home-figures-head">
            <h2>{t("figures.title")}</h2>
            <Link className="hex hex-md hex-slate" href="/status">
              {t("figures.status")}
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
          <h2>{t("faq.title")}</h2>
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
            <h2 className="c-lime">{t("cta.title", { name: BRAND.name })}</h2>
            <div className="hex-group">
              <Link className="hex-outline hex-notch hex-md hex-lime" href="/docs">
                {t("cta.docs")}
              </Link>
              <Link className="hex hex-md hex-green" href="/vaults">
                {t("cta.start")}
              </Link>
            </div>
            <RiskNote t={t} tone="cta" />
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
