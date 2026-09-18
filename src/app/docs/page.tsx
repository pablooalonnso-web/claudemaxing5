import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bot, Check, Clock3, Coins, Flame, LockKeyhole, RadioTower, RefreshCw, Route, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import { explorerAddress } from "@/lib/chain";
import { VAULT_PINS } from "@/lib/registry";
import styles from "@/styles/docs.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("docs");
  return { title: `${t("meta.title")} · ${BRAND.name}` };
}

const CONTRACTS = [...VAULT_PINS].sort((a, b) => a.symbol.localeCompare(b.symbol));

export default async function DocsPage() {
  const t = await getT("docs");
  const brand = BRAND.name;
  const token = t("token", { brand });
  const steps = [1, 2, 3, 4] as const;
  const roadmap = [
    { n: "01", id: 1, icon: "sparkles" },
    { n: "02", id: 2, icon: "sparkles" },
    { n: "03", id: 3, icon: "sparkles" },
    { n: "04", id: 4, icon: "bot" },
  ] as const;
  return (
    <main className="app-page">
      <SiteHeader />
      <div className={styles.page}>
        <aside className={styles.aside} aria-label={t("aside.label")}>
          <p>{t("aside.onThisPage")}</p>
          <nav>
            <Link href="/help">{t("aside.help")}</Link>
            <Link href="/verify">{t("aside.verify")}</Link>
            <a href="#overview">{t("aside.overview")}</a>
            <a href="#vaults">{t("aside.vaults")}</a>
            <a href="#safeguards">{t("aside.safeguards")}</a>
            <a href="#flywheel">{t("aside.flywheel", { token })}</a>
            <a href="#oracles">{t("aside.oracles")}</a>
            <a href="#contracts">{t("aside.contracts")}</a>
            <a href="#source">{t("aside.source")}</a>
            <a href="#roadmap">{t("aside.roadmap")}</a>
            <a href="#faq">{t("aside.faq")}</a>
          </nav>
        </aside>
        <article className={styles.content}>
          <header className={styles.hero} id="overview">
            <div className={styles.heroMeta}>
              <span>{t("hero.kicker")}</span>
              <span>Robinhood Chain · 4663</span>
            </div>
            <h1>
              {t("hero.title.line1")}
              <br />
              {t("hero.title.line2")}
              <em>{t("hero.title.em")}</em>
            </h1>
            <p>{t("hero.lead", { brand })}</p>
            <div className={styles.heroActions}>
              <Link className="btn btn-primary" href="/vaults">
                {t("hero.explore")} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a className="btn btn-ghost" href="#contracts">
                {t("hero.contracts")}
              </a>
            </div>
          </header>

          <section className={styles.section} id="vaults">
            <div className={styles.sectionLabel}>{t("vaults.label")}</div>
            <div className={styles.sectionIntro}>
              <h2>{t("vaults.title")}</h2>
              <p>{t("vaults.lead")}</p>
            </div>
            <div className={styles.steps}>
              {steps.map((n, i) => (
                <article key={n}>
                  <span>{i + 1}</span>
                  <h3>{t(`vaults.step${n}.title`)}</h3>
                  <p>{t(`vaults.step${n}.body`)}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} id="safeguards">
            <div className={styles.sectionLabel}>{t("safeguards.label")}</div>
            <div className={styles.sectionIntro}>
              <h2>{t("safeguards.title")}</h2>
              <p>{t("safeguards.lead", { brand })}</p>
            </div>
            <div className={styles.safeguardGrid}>
              <article>
                <ShieldCheck size={22} aria-hidden="true" />
                <h3>{t("safeguards.bounded.title")}</h3>
                <p>{t("safeguards.bounded.body")}</p>
              </article>
              <article>
                <LockKeyhole size={22} aria-hidden="true" />
                <h3>{t("safeguards.separated.title")}</h3>
                <p>{t("safeguards.separated.body")}</p>
              </article>
              <article>
                <Clock3 size={22} aria-hidden="true" />
                <h3>{t("safeguards.delayed.title")}</h3>
                <p>{t("safeguards.delayed.body")}</p>
              </article>
              <article>
                <Route size={22} aria-hidden="true" />
                <h3>{t("safeguards.exits.title")}</h3>
                <p>{t("safeguards.exits.body")}</p>
              </article>
            </div>
          </section>


          <section className={styles.section} id="flywheel">
            <div className={styles.sectionLabel}>{t("flywheel.label", { token })}</div>
            <div className={styles.sectionIntro}>
              <h2>{t("flywheel.title")}</h2>
              <p>{t("flywheel.lead", { token })}</p>
            </div>
            <div className={styles.feeSplit}>
              <article>
                <strong>70%</strong>
                <h3>{t("flywheel.retained.title")}</h3>
                <p>{t("flywheel.retained.body")}</p>
              </article>
              <article className={styles.buybackShare}>
                <strong>20%</strong>
                <h3>{t("flywheel.buyback.title", { token })}</h3>
                <p>{t("flywheel.buyback.body", { token })}</p>
              </article>
              <article>
                <strong>10%</strong>
                <h3>{t("flywheel.treasury.title")}</h3>
                <p>{t("flywheel.treasury.body")}</p>
              </article>
            </div>
            <div className={styles.flywheelFlow}>
              <div>
                <Coins size={22} aria-hidden="true" />
                <span>{t("flywheel.flow.fees")}</span>
              </div>
              <ArrowRight size={18} aria-hidden="true" />
              <div>
                <RefreshCw size={22} aria-hidden="true" />
                <span>{t("flywheel.flow.buybacks")}</span>
              </div>
              <ArrowRight size={18} aria-hidden="true" />
              <div>
                <Flame size={22} aria-hidden="true" />
                <span>{t("flywheel.flow.burn", { token })}</span>
              </div>
              <ArrowRight size={18} aria-hidden="true" />
              <div>
                <Sparkles size={22} aria-hidden="true" />
                <span>{t("flywheel.flow.supply")}</span>
              </div>
            </div>
          </section>

          <section className={styles.section} id="oracles">
            <div className={styles.sectionLabel}>{t("oracles.label")}</div>
            <div className={styles.sectionIntro}>
              <h2>{t("oracles.title")}</h2>
              <p>{t("oracles.lead", { brand })}</p>
            </div>
            <div className={styles.oraclePanel}>
              <div className={styles.oracleBadge}>
                <RadioTower size={32} aria-hidden="true" />
                <strong>24/5</strong>
                <span>{t("oracles.badge")}</span>
              </div>
              <div className={styles.oracleRules}>
                <article>
                  <ShieldCheck size={20} aria-hidden="true" />
                  <div>
                    <h3>{t("oracles.deposits.title")}</h3>
                    <p>{t("oracles.deposits.body")}</p>
                  </div>
                </article>
                <article>
                  <Clock3 size={20} aria-hidden="true" />
                  <div>
                    <h3>{t("oracles.weekends.title")}</h3>
                    <p>{t("oracles.weekends.body")}</p>
                  </div>
                </article>
                <article>
                  <WalletCards size={20} aria-hidden="true" />
                  <div>
                    <h3>{t("oracles.exits.title")}</h3>
                    <p>{t("oracles.exits.body")}</p>
                  </div>
                </article>
                <article>
                  <RefreshCw size={20} aria-hidden="true" />
                  <div>
                    <h3>{t("oracles.rebalances.title")}</h3>
                    <p>{t("oracles.rebalances.body")}</p>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className={styles.section} id="contracts">
            <div className={styles.sectionLabel}>{t("contracts.label")}</div>
            <div className={styles.sectionIntro}>
              <h2>{t("contracts.title")}</h2>
              <p>{t("contracts.lead", { count: CONTRACTS.length })}</p>
            </div>
            <div className={styles.contractHeader}>
              <span>{t("contracts.col.vault")}</span>
              <span>{t("contracts.col.address")}</span>
              <span>{t("contracts.col.source")}</span>
            </div>
            <div className={styles.contractList}>
              {CONTRACTS.map((c) => (
                <div className={styles.contractRow} key={c.symbol}>
                  <strong>{c.symbol}</strong>
                  <a className={styles.address} href={`${explorerAddress(c.vault)}?tab=contract`} target="_blank" rel="noreferrer" aria-label={t("contracts.explorerAria", { symbol: c.symbol })}>
                    <span className={styles.fullAddress}>{c.vault}</span>
                    <span className={styles.shortAddress}>
                      {c.vault.slice(0, 8)}…{c.vault.slice(-6)}
                    </span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  <a className={styles.verified} href={`https://repo.sourcify.dev/4663/${c.vault}`} target="_blank" rel="noreferrer" aria-label={t("contracts.sourcifyAria", { symbol: c.symbol })}>
                    <Check size={13} aria-hidden="true" /> {t("contracts.verified")}
                  </a>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section} id="source">
            <div className={styles.sectionLabel}>{t("source.label")}</div>
            <div className={styles.sectionIntro}>
              <h2>{t("source.title")}</h2>
              <p>{t("source.lead", { brand })}</p>
            </div>
            <div className={styles.safeguardGrid}>
              <article>
                <Bot size={22} aria-hidden="true" />
                <h3>{t("source.reads.title")}</h3>
                <p>
                  {t("source.reads.body")}{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/src/lib/managed-vault.ts`} target="_blank" rel="noreferrer">
                    src/lib/managed-vault.ts ↗
                  </a>
                </p>
              </article>
              <article>
                <Route size={22} aria-hidden="true" />
                <h3>{t("source.deposits.title")}</h3>
                <p>
                  {t("source.deposits.body")}{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/src/components/strategies/BasketStrategy.tsx`} target="_blank" rel="noreferrer">
                    src/components/strategies ↗
                  </a>
                </p>
              </article>
              <article>
                <ShieldCheck size={22} aria-hidden="true" />
                <h3>{t("source.verification.title")}</h3>
                <p>
                  {t("source.verification.before")}
                  <Link href="/verify">/verify</Link>
                  {t("source.verification.after")}{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/scripts/verify.ts`} target="_blank" rel="noreferrer">
                    scripts/verify.ts ↗
                  </a>
                </p>
              </article>
              <article>
                <RadioTower size={22} aria-hidden="true" />
                <h3>{t("source.intelligence.title")}</h3>
                <p>
                  {t("source.intelligence.body")}{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/src/server/intelligence.ts`} target="_blank" rel="noreferrer">
                    src/server/intelligence.ts ↗
                  </a>
                </p>
              </article>
            </div>
            <div className={styles.codeGrid}>
              <figure className={styles.codeBlock}>
                <figcaption>scripts/verify.ts · {t("source.code.feeSplit")}</figcaption>
                <pre>{`const [g0, g1, p0, p1, b0, b1] = await Promise.all([
  read("grossFees", 0n), read("grossFees", 1n),
  read("protocolFees", 0n), read("protocolFees", 1n),
  read("buybackFees", 0n), read("buybackFees", 1n),
]);
const buyback = pct(b0, g0);   // 20%
const treasury = pct(p0, g0);  // 10%
const ok = Math.abs(buyback - CLAIM.buyback) <= 0.5
  && Math.abs(treasury - CLAIM.treasury) <= 0.5;`}</pre>
              </figure>
              <figure className={styles.codeBlock}>
                <figcaption>src/server/intelligence.ts · {t("source.code.range")}</figcaption>
                <pre>{`const rangePosition = (price - lower) / (upper - lower); // 0 → lower bound, 1 → upper
if (inRange === false) flags.push("out of range");
else if (rangePosition < 0.15 || rangePosition > 0.85)
  flags.push(rangePosition < 0.15 ? "near lower bound" : "near upper bound");
if (oracleAgeSeconds > 26 * 3600) flags.push("oracle stale");`}</pre>
              </figure>
            </div>
            <div className={styles.codeGrid}>
              <figure className={styles.codeBlock}>
                <figcaption>{t("source.code.run")}</figcaption>
                <pre>{`git clone ${BRAND.repoUrl}.git vertex
cd vertex && npm install
npm run dev        # the site on http://localhost:3000
npm run verify     # the same checks /verify publishes`}</pre>
              </figure>
              <div className={styles.codeNote}>
                <h3>{t("source.find.title")}</h3>
                <p>{t("source.find.body")}</p>
                <a className="btn btn-primary" href={BRAND.repoUrl} target="_blank" rel="noreferrer">
                  {t("source.find.cta")} <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            </div>
          </section>

          <section className={styles.section} id="roadmap">
            <div className={styles.sectionLabel}>{t("roadmap.label")}</div>
            <div className={styles.sectionIntro}>
              <h2>{t("roadmap.title")}</h2>
              <p>{t("roadmap.lead")}</p>
            </div>
            <div className={styles.roadmap}>
              {roadmap.map(({ n, id, icon }) => (
                <article key={n}>
                  <div className={styles.roadmapMarker}>{icon === "bot" ? <Bot size={20} aria-hidden="true" /> : <Sparkles size={20} aria-hidden="true" />}</div>
                  <div>
                    <span>
                      {n} · {t(`roadmap.${id}.stage`)}
                    </span>
                    <h3>{t(`roadmap.${id}.title`)}</h3>
                    <p>{t(`roadmap.${id}.body`)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} id="faq">
            <div className={styles.sectionLabel}>{t("faq.label")}</div>
            <div className={styles.faq}>
              <details>
                <summary>{t("faq.1.q")}</summary>
                <p>{t("faq.1.a")}</p>
              </details>
              <details>
                <summary>{t("faq.2.q")}</summary>
                <p>{t("faq.2.a")}</p>
              </details>
              <details>
                <summary>{t("faq.3.q")}</summary>
                <p>{t("faq.3.a")}</p>
              </details>
              <details>
                <summary>{t("faq.4.q", { token })}</summary>
                <p>{t("faq.4.a", { token })}</p>
              </details>
              <details>
                <summary>{t("faq.5.q")}</summary>
                <p>{t("faq.5.a")}</p>
              </details>
              <details>
                <summary>{t("faq.6.q")}</summary>
                <p>
                  {t("faq.6.before")}
                  <a href={BRAND.xUrl} target="_blank" rel="noreferrer">
                    @{BRAND.xHandle}
                  </a>
                  {t("faq.6.after")}
                </p>
              </details>
            </div>
          </section>
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}
