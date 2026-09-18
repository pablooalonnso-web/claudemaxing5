import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Countdown } from "@/components/intelligence/Countdown";
import { IntelligenceOrbit } from "@/components/intelligence/IntelligenceOrbit";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import styles from "@/styles/intelligence.module.css";
import { SiteFooter } from "@/components/SiteFooter";
import { IntelligenceDesk } from "@/components/intelligence/IntelligenceDesk";
import { analystOnline, composeBrief, getBrief, getSignals, GUIDED_QUESTIONS } from "@/server/intelligence";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("intelligence");
  return { title: `${t("meta.title")} · ${BRAND.name}`, description: t("meta.description") };
}
export const dynamic = "force-dynamic";

const REVEAL = "2026-09-18T09:00:00Z";

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getT("intelligence");
  const params = await searchParams;
  const revealed = Date.now() >= Date.parse(REVEAL) || params.preview === "1";
  if (revealed) {
    const online = analystOnline();
    const initial = await Promise.all([getSignals(), getBrief()])
      .then(([signals, brief]) => ({ analyst: online ? ("online" as const) : ("offline" as const), signals, brief: brief ?? composeBrief(signals), guided: GUIDED_QUESTIONS }))
      .catch(() => null);
    return (
      <main className="app-page">
        <SiteHeader />
        <section className="masthead">
          <div className="masthead-inner">
            <div className="masthead-head">
              <div className="masthead-title">
                <p className="eyebrow">{t("live.eyebrow")}</p>
                <h1>
                  {t("live.title.before")}
                  <em className="serif">{t("live.title.em")}</em>
                </h1>
              </div>
              <p className="masthead-intro">{online ? t("live.intro.online") : t("live.intro.offline")}</p>
            </div>
          </div>
        </section>
        <IntelligenceDesk initial={initial} />
        <SiteFooter />
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.chamber} aria-labelledby="intelligence-title">
        <div className={styles.topline}>
          <span className={styles.status}>
            <span /> {t("teaser.status")}
          </span>
          <span className={styles.edition}>{t("teaser.edition", { brand: BRAND.nameUpper })}</span>
        </div>
        <div className={styles.hero}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>
              {t("teaser.eyebrow.before")} <span>×</span> {t("teaser.eyebrow.after")}
            </p>
            <h1 id="intelligence-title">
              {t("teaser.title.before")}
              <br />
              <em>{t("teaser.title.em")}</em>
            </h1>
            <p className={styles.intro}>
              {t("teaser.intro.1")}
              <br />
              {t("teaser.intro.2")}
            </p>
            <p className={styles.secret}>{t("teaser.secret")}</p>
            <a className={styles.follow} href={BRAND.xUrl} target="_blank" rel="noopener noreferrer">
              {t("teaser.follow")} <ArrowUpRight size={17} aria-hidden="true" />
              <span className={styles.srOnly}>{t("teaser.follow.sr")}</span>
            </a>
          </div>
          <div className={styles.signal} aria-hidden="true">
            <div className={styles.signalHalo} />
            <IntelligenceOrbit />
            <div className={styles.axisHorizontal} />
            <div className={styles.axisVertical} />
            <span className={styles.signalLabel}>{t("teaser.signalLabel")}</span>
            <span className={styles.signalIndex}>{BRAND.name.slice(0, 2).toUpperCase()} · 01</span>
          </div>
        </div>
        <div className={styles.reveal}>
          <div className={styles.revealCopy}>
            <p className={styles.eyebrow}>{t("teaser.countdown.eyebrow")}</p>
            <p className={styles.revealDate}>
              {t("teaser.reveal.before")}
              <time dateTime={REVEAL}>{t("teaser.reveal.date")}</time>
            </p>
            <p className={styles.estimate}>{t("teaser.estimate")}</p>
          </div>
          <Countdown target={REVEAL} />
        </div>
        <div className={styles.bottomline}>
          <span>{t("teaser.bottom.1")}</span>
          <Plus size={14} aria-hidden="true" />
          <span>{t("teaser.bottom.2")}</span>
        </div>
      </section>
      <footer className={styles.footer}>
        <Link href="/">
          <ArrowLeft size={14} aria-hidden="true" /> {t("teaser.back", { brand: BRAND.name })}
        </Link>
        <span>{t("teaser.tagline")}</span>
        <span>© {new Date().getFullYear()} {BRAND.name}</span>
      </footer>
    </main>
  );
}
