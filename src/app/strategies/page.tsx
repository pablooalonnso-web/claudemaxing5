import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Lock, Plus } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StockLogo } from "@/components/StockLogo";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import "@/styles/strategies.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("strategies");
  return { title: `${t("meta.title")} · ${BRAND.name}` };
}

const BASKET = ["MSTR", "PLTR", "GME", "TSLA", "NVDA", "AMD"];

export default async function StrategiesPage() {
  const t = await getT("strategies");
  return (
    <main className="app-page">
      <SiteHeader />
      <section className="masthead">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">{t("hero.eyebrow")}</p>
              <h1>
                {t("hero.title.before")}
                <em className="serif">{t("hero.title.em")}</em>
              </h1>
            </div>
            <p className="masthead-intro">{t("hero.intro")}</p>
            <div className="masthead-aside">
              <span className="strategy-status strategy-status-live">
                <i aria-hidden="true" /> {t("hero.live")}
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
                <p className="eyebrow">{t("basket.eyebrow")}</p>
                <h2>{t("basket.title")}</h2>
              </div>
              <span className="strategy-status strategy-status-live">
                <i aria-hidden="true" /> {t("basket.live")}
              </span>
            </header>
            <div className="strategy-visual strategy-basket" aria-label={t("basket.visualAria")}>
              <div className="strategy-basket-marks">
                {BASKET.map((s, i) => (
                  <span key={s} style={{ zIndex: BASKET.length - i }}>
                    <StockLogo symbol={s} size={44} />
                  </span>
                ))}
              </div>
              <div className="strategy-basket-copy">
                <b>{t("basket.visualTitle")}</b>
                <span>{t("basket.visualSub")}</span>
              </div>
            </div>
            <p className="strategy-lede">{t("basket.lede")}</p>
            <dl className="strategy-facts">
              <div>
                <dt>{t("facts.earns")}</dt>
                <dd>{t("basket.earns")}</dd>
              </div>
              <div>
                <dt>{t("facts.exposure")}</dt>
                <dd>{t("basket.exposure")}</dd>
              </div>
              <div>
                <dt>{t("facts.deposit")}</dt>
                <dd className="strategy-deposit">
                  <Image src="/brands/usdg.png" alt="" width={22} height={22} /> USDG
                </dd>
              </div>
            </dl>
            <footer className="strategy-card-foot">
              <span className="strategy-closed">{t("basket.foot")}</span>
              <Link href="/strategies/basket">
                {t("basket.open")} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </article>
          <article className="strategy-card">
            <header className="strategy-card-head">
              <div>
                <p className="eyebrow">{t("neutral.eyebrow")}</p>
                <h2>{t("neutral.title")}</h2>
              </div>
              <span className="strategy-status">
                <Lock size={12} strokeWidth={1.6} aria-hidden="true" /> {t("neutral.inDesign")}
              </span>
            </header>
            <div className="strategy-visual strategy-neutral" aria-label={t("neutral.visualAria")}>
              <div className="strategy-side strategy-long">
                <span className="strategy-side-label">
                  <ArrowUpRight size={13} aria-hidden="true" /> {t("neutral.long")}
                </span>
                <span className="strategy-side-marks">
                  <StockLogo symbol="TSLA" size={36} />
                  <span className="strategy-usdg">
                    <Image alt="USDG" width={36} height={36} src="/brands/usdg.png" />
                  </span>
                </span>
                <b>{t("neutral.longTitle")}</b>
                <span>{t("neutral.longSub")}</span>
              </div>
              <div className="strategy-combine" aria-hidden="true">
                <Plus size={16} strokeWidth={1.6} />
              </div>
              <div className="strategy-side strategy-short">
                <span className="strategy-side-label">
                  <ArrowDownRight size={13} aria-hidden="true" /> {t("neutral.short")}
                </span>
                <span className="strategy-side-marks">
                  <StockLogo symbol="TSLA" size={36} />
                </span>
                <b>{t("neutral.shortTitle")}</b>
                <span>{t("neutral.shortSub")}</span>
              </div>
              <div className="strategy-result">{t("neutral.result")}</div>
            </div>
            <p className="strategy-lede">
              {t("neutral.lede.before")}
              <span className="strategy-inline-mark">
                <StockLogo symbol="TSLA" size={18} />
                {t("neutral.lede.first")}
              </span>
              <span className="strategy-inline-mark">
                <StockLogo symbol="MSTR" size={18} />
                {t("neutral.lede.second")}
              </span>
              {t("neutral.lede.after")}
            </p>
            <dl className="strategy-facts">
              <div>
                <dt>{t("facts.earns")}</dt>
                <dd>{t("neutral.earns")}</dd>
              </div>
              <div>
                <dt>{t("facts.exposure")}</dt>
                <dd>{t("neutral.exposure")}</dd>
              </div>
              <div>
                <dt>{t("facts.deposit")}</dt>
                <dd className="strategy-deposit">
                  <Image src="/brands/usdg.png" alt="" width={22} height={22} /> USDG
                </dd>
              </div>
            </dl>
            <footer className="strategy-card-foot">
              <span className="strategy-closed">{t("neutral.foot")}</span>
              <Link href="/lending">
                {t("neutral.lending")} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </footer>
          </article>
        </div>
        <section className="strategy-notes" aria-label={t("notes.aria")}>
          <div>
            <h3>{t("notes.isTitle")}</h3>
            <p>{t("notes.isBody", { brand: BRAND.name })}</p>
          </div>
          <div>
            <h3>{t("notes.notTitle")}</h3>
            <p>{t("notes.notBody")}</p>
          </div>
          <div>
            <h3>{t("notes.beforeTitle")}</h3>
            <p>{t("notes.beforeBody")}</p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
