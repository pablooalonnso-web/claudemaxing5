import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Plus } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Countdown } from "@/components/intelligence/Countdown";
import { IntelligenceOrbit } from "@/components/intelligence/IntelligenceOrbit";
import { BRAND } from "@/lib/brand";
import styles from "@/styles/intelligence.module.css";

export const metadata: Metadata = { title: `Intelligence · ${BRAND.name}` };

const REVEAL = "2026-10-13T00:00:00-04:00";

export default function IntelligencePage() {
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
              Artificial intelligence <span>×</span> DeFi
            </p>
            <h1 id="intelligence-title">
              A new primitive.
              <br />
              <em>For capital.</em>
            </h1>
            <p className={styles.intro}>
              AI and DeFi, brought together.
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
            <span className={styles.signalIndex}>{BRAND.name.slice(0, 2).toUpperCase()} — 01</span>
          </div>
        </div>
        <div className={styles.reveal}>
          <div className={styles.revealCopy}>
            <p className={styles.eyebrow}>The countdown begins</p>
            <p className={styles.revealDate}>
              Estimated reveal <time dateTime={REVEAL}>October 13, 2026</time>
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
