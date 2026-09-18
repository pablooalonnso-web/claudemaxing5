import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Countdown } from "@/components/intelligence/Countdown";
import { IntelligenceOrbit } from "@/components/intelligence/IntelligenceOrbit";
import { BRAND } from "@/lib/brand";
import styles from "@/styles/intelligence.module.css";
import { SiteFooter } from "@/components/SiteFooter";
import { IntelligenceDesk } from "@/components/intelligence/IntelligenceDesk";
import { analystOnline, composeBrief, getBrief, getSignals, GUIDED_QUESTIONS } from "@/server/intelligence";

export const metadata: Metadata = { title: `Intelligence · ${BRAND.name}`, description: "Live signals from the 18 vaults and the lending market, a written brief and a question box, all grounded in chain reads." };
export const dynamic = "force-dynamic";

const REVEAL = "2026-09-18T09:00:00Z";

export default async function IntelligencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
                <p className="eyebrow">Intelligence · live</p>
                <h1>
                  The chain, <em className="serif">read out loud.</em>
                </h1>
              </div>
              <p className="masthead-intro">
                {online
                  ? "Every minute the server reads all 18 vaults and the lending market and turns the numbers into signals. A rules engine writes the brief and answers the guided questions; a language model adds a second reading and takes free questions. Both see nothing but the chain and never tell you what to do with yours."
                  : "Every minute the server reads all 18 vaults and the lending market and turns the numbers into signals, a written brief and answers to the questions people ask most. No model, no guesswork: every sentence is a rule filled with a number read from the chain a moment earlier."}
              </p>
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
            <span /> Coming soon
          </span>
          <span className={styles.edition}>{BRAND.nameUpper} / NEXT CHAPTER</span>
        </div>
        <div className={styles.hero}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>
              Onchain intelligence <span>×</span> DeFi
            </p>
            <h1 id="intelligence-title">
              A new primitive.
              <br />
              <em>For capital.</em>
            </h1>
            <p className={styles.intro}>
              Signals and DeFi, brought together.
              <br />A new foundation for how capital moves onchain.
            </p>
            <p className={styles.secret}>Intelligence at the core. The rest, under wraps.</p>
            <a className={styles.follow} href={BRAND.xUrl} target="_blank" rel="noopener noreferrer">
              Follow the reveal <ArrowUpRight size={17} aria-hidden="true" />
              <span className={styles.srOnly}> on X (opens in a new tab)</span>
            </a>
          </div>
          <div className={styles.signal} aria-hidden="true">
            <div className={styles.signalHalo} />
            <IntelligenceOrbit />
            <div className={styles.axisHorizontal} />
            <div className={styles.axisVertical} />
            <span className={styles.signalLabel}>FORM / UNKNOWN</span>
            <span className={styles.signalIndex}>{BRAND.name.slice(0, 2).toUpperCase()} · 01</span>
          </div>
        </div>
        <div className={styles.reveal}>
          <div className={styles.revealCopy}>
            <p className={styles.eyebrow}>The countdown begins</p>
            <p className={styles.revealDate}>
              Estimated reveal <time dateTime={REVEAL}>September 18, 2026, 09:00 UTC (11:00 CEST)</time>
            </p>
            <p className={styles.estimate}>An early look. Timing may evolve.</p>
          </div>
          <Countdown target={REVEAL} />
        </div>
        <div className={styles.bottomline}>
          <span>TWO WORLDS. ONE NEW PRIMITIVE.</span>
          <Plus size={14} aria-hidden="true" />
          <span>MORE WHEN THE TIME IS RIGHT.</span>
        </div>
      </section>
      <footer className={styles.footer}>
        <Link href="/">
          <ArrowLeft size={14} aria-hidden="true" /> Back to {BRAND.name}
        </Link>
        <span>Something worth waiting for.</span>
        <span>© {new Date().getFullYear()} {BRAND.name}</span>
      </footer>
    </main>
  );
}
