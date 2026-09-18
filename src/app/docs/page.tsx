import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bot, Check, Clock3, Coins, Flame, LockKeyhole, RadioTower, RefreshCw, Route, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/lib/brand";
import { explorerAddress } from "@/lib/chain";
import { VAULT_PINS } from "@/lib/registry";
import styles from "@/styles/docs.module.css";

export const metadata: Metadata = { title: `Docs · ${BRAND.name}` };

const CONTRACTS = [...VAULT_PINS].sort((a, b) => a.symbol.localeCompare(b.symbol));

export default function DocsPage() {
  const token = `${BRAND.name} token`;
  return (
    <main className="app-page">
      <SiteHeader />
      <div className={styles.page}>
        <aside className={styles.aside} aria-label="Documentation sections">
          <p>On this page</p>
          <nav>
            <Link href="/help">Help center ↗</Link>
            <Link href="/verify">Verification ↗</Link>
            <a href="#overview">Overview</a>
            <a href="#vaults">Vaults</a>
            <a href="#safeguards">Safeguards</a>
            <a href="#flywheel">{token} flywheel</a>
            <a href="#oracles">Chainlink safety</a>
            <a href="#contracts">Contracts</a>
            <a href="#source">Open source</a>
            <a href="#roadmap">Roadmap</a>
            <a href="#faq">FAQ</a>
          </nav>
        </aside>
        <article className={styles.content}>
          <header className={styles.hero} id="overview">
            <div className={styles.heroMeta}>
              <span>Documentation</span>
              <span>Robinhood Chain · 4663</span>
            </div>
            <h1>
              Markets move.
              <br />
              Your capital can <em>work with them.</em>
            </h1>
            <p>{BRAND.name} brings tokenized-stock liquidity strategies, vaults, and lending into one onchain experience. This guide explains the essentials without the protocol jargon.</p>
            <div className={styles.heroActions}>
              <Link className="btn btn-primary" href="/vaults">
                Explore vaults <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a className="btn btn-ghost" href="#contracts">
                View contracts
              </a>
            </div>
          </header>

          <section className={styles.section} id="vaults">
            <div className={styles.sectionLabel}>01 · Vaults</div>
            <div className={styles.sectionIntro}>
              <h2>A simple way to participate in onchain market making.</h2>
              <p>Deposit USDG into a vault and receive vault shares in return. The strategy supplies liquidity around a tokenized stock market, collects trading fees, and adjusts its range as the market moves.</p>
            </div>
            <div className={styles.steps}>
              {[
                ["Choose a market", "Select the company or ETF vault that fits your interests."],
                ["Deposit USDG", "Your vault shares track your portion of the vault."],
                ["Follow performance", "See holdings, fees, activity, and your position in one place."],
                ["Withdraw when ready", "Use the available withdrawal path shown by the app."],
              ].map(([h, p], i) => (
                <article key={h}>
                  <span>{i + 1}</span>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} id="safeguards">
            <div className={styles.sectionLabel}>02 · Safeguards</div>
            <div className={styles.sectionIntro}>
              <h2>Guardrails are part of the product.</h2>
              <p>{BRAND.name} combines live market data with onchain limits and clearly separated controls. If required information is not available, sensitive actions wait instead of guessing.</p>
            </div>
            <div className={styles.safeguardGrid}>
              <article>
                <ShieldCheck size={22} aria-hidden="true" />
                <h3>Bounded execution</h3>
                <p>Every vault operates within defined limits for price movement, trade size, and acceptable execution loss.</p>
              </article>
              <article>
                <LockKeyhole size={22} aria-hidden="true" />
                <h3>Separated controls</h3>
                <p>Day-to-day operation, emergency controls, and protocol treasury responsibilities use separate roles.</p>
              </article>
              <article>
                <Clock3 size={22} aria-hidden="true" />
                <h3>Delayed changes</h3>
                <p>Important configuration changes follow a review window instead of taking effect immediately.</p>
              </article>
              <article>
                <Route size={22} aria-hidden="true" />
                <h3>Flexible exits</h3>
                <p>Vaults include multiple withdrawal and recovery paths so users are not dependent on a single trade route.</p>
              </article>
            </div>
          </section>


          <section className={styles.section} id="flywheel">
            <div className={styles.sectionLabel}>03 · The {token} flywheel</div>
            <div className={styles.sectionIntro}>
              <h2>Protocol growth feeds back into the ecosystem.</h2>
              <p>The fee split applies only to liquidity fees earned by the vaults, not to deposits or withdrawals. Seven tenths of every claimed fee stays with vault participants, two tenths buy back and burn the {token}, and one tenth goes to the protocol treasury. The split is enforced by the vault contract and visible in its counters.</p>
            </div>
            <div className={styles.feeSplit}>
              <article>
                <strong>70%</strong>
                <h3>Retained by the vault</h3>
                <p>Compounds back into the position for vault participants.</p>
              </article>
              <article className={styles.buybackShare}>
                <strong>20%</strong>
                <h3>{token} buybacks</h3>
                <p>Reserved to buy the {token} and permanently burn it.</p>
              </article>
              <article>
                <strong>10%</strong>
                <h3>Protocol treasury</h3>
                <p>Funds keepers, oracles and development of the protocol.</p>
              </article>
            </div>
            <div className={styles.flywheelFlow}>
              <div>
                <Coins size={22} aria-hidden="true" />
                <span>Vaults generate fees</span>
              </div>
              <ArrowRight size={18} aria-hidden="true" />
              <div>
                <RefreshCw size={22} aria-hidden="true" />
                <span>20% funds buybacks</span>
              </div>
              <ArrowRight size={18} aria-hidden="true" />
              <div>
                <Flame size={22} aria-hidden="true" />
                <span>Purchased {token} is burned</span>
              </div>
              <ArrowRight size={18} aria-hidden="true" />
              <div>
                <Sparkles size={22} aria-hidden="true" />
                <span>Supply is permanently reduced</span>
              </div>
            </div>
          </section>

          <section className={styles.section} id="oracles">
            <div className={styles.sectionLabel}>05 · Chainlink safety</div>
            <div className={styles.sectionIntro}>
              <h2>Fresh reference prices come before speed.</h2>
              <p>Tokenized-stock markets follow a 24/5 schedule. {BRAND.name} uses Chainlink as an independent reference before accepting a price-dependent action, rather than trusting a pool price by itself.</p>
            </div>
            <div className={styles.oraclePanel}>
              <div className={styles.oracleBadge}>
                <RadioTower size={32} aria-hidden="true" />
                <strong>24/5</strong>
                <span>Chainlink stock pricing</span>
              </div>
              <div className={styles.oracleRules}>
                <article>
                  <ShieldCheck size={20} aria-hidden="true" />
                  <div>
                    <h3>Deposits check the reference price</h3>
                    <p>A deposit proceeds only when the Chainlink price is fresh and the pool remains within its permitted range.</p>
                  </div>
                </article>
                <article>
                  <Clock3 size={20} aria-hidden="true" />
                  <div>
                    <h3>Weekends favor safety</h3>
                    <p>When stock feeds stop updating, deposits and other price-dependent actions can pause until fresh pricing returns.</p>
                  </div>
                </article>
                <article>
                  <WalletCards size={20} aria-hidden="true" />
                  <div>
                    <h3>Vault-share exits remain available</h3>
                    <p>Users can withdraw their proportional underlying tokens without waiting for a stock sale. A one-click USDG conversion waits for a live protected price.</p>
                  </div>
                </article>
                <article>
                  <RefreshCw size={20} aria-hidden="true" />
                  <div>
                    <h3>Strategy changes are checked too</h3>
                    <p>Rebalances compare current pool conditions with Chainlink before assets are repositioned.</p>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className={styles.section} id="contracts">
            <div className={styles.sectionLabel}>06 · Smart contracts</div>
            <div className={styles.sectionIntro}>
              <h2>Verify, don’t trust.</h2>
              <p>These are the {CONTRACTS.length} user-facing V7 vault contracts deployed on Robinhood Chain. Each address opens in Robinhood Chain Blockscout, and its matching public source is available through Sourcify.</p>
            </div>
            <div className={styles.contractHeader}>
              <span>Vault</span>
              <span>Contract address</span>
              <span>Source</span>
            </div>
            <div className={styles.contractList}>
              {CONTRACTS.map((c) => (
                <div className={styles.contractRow} key={c.symbol}>
                  <strong>{c.symbol}</strong>
                  <a className={styles.address} href={`${explorerAddress(c.vault)}?tab=contract`} target="_blank" rel="noreferrer" aria-label={`${c.symbol} vault on Robinhood Chain Blockscout`}>
                    <span className={styles.fullAddress}>{c.vault}</span>
                    <span className={styles.shortAddress}>
                      {c.vault.slice(0, 8)}…{c.vault.slice(-6)}
                    </span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  <a className={styles.verified} href={`https://repo.sourcify.dev/4663/${c.vault}`} target="_blank" rel="noreferrer" aria-label={`${c.symbol} verified source on Sourcify`}>
                    <Check size={13} aria-hidden="true" /> Verified
                  </a>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section} id="source">
            <div className={styles.sectionLabel}>07 · Open source</div>
            <div className={styles.sectionIntro}>
              <h2>The whole site, in the open.</h2>
              <p>
                {BRAND.name} is published under the MIT license. Every figure on the site is a chain read you can run yourself, and the code that makes those reads
                sits in one repository: the vault quotes, the router calls, the verification script and the rules behind Intelligence. The vault contracts are
                the protocol&apos;s, verified on Sourcify above; what is open here is everything between the chain and your screen.
              </p>
            </div>
            <div className={styles.safeguardGrid}>
              <article>
                <Bot size={22} aria-hidden="true" />
                <h3>Chain reads</h3>
                <p>
                  One read-only client with fallback endpoints, the vault state reader and the snapshot service that refreshes every 15 seconds.{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/src/lib/managed-vault.ts`} target="_blank" rel="noreferrer">
                    src/lib/managed-vault.ts ↗
                  </a>
                </p>
              </article>
              <article>
                <Route size={22} aria-hidden="true" />
                <h3>Deposits and withdrawals</h3>
                <p>
                  How a USDG budget becomes a router deposit, and how a redemption is quoted and simulated before you sign. The basket, Exit and Zap reuse it.{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/src/components/strategies/BasketStrategy.tsx`} target="_blank" rel="noreferrer">
                    src/components/strategies ↗
                  </a>
                </p>
              </article>
              <article>
                <ShieldCheck size={22} aria-hidden="true" />
                <h3>Verification</h3>
                <p>
                  The script behind <Link href="/verify">/verify</Link>: contract wiring, fee counters, simulated deposits and withdrawals through state overrides,
                  site and API checks.{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/scripts/verify.ts`} target="_blank" rel="noreferrer">
                    scripts/verify.ts ↗
                  </a>
                </p>
              </article>
              <article>
                <RadioTower size={22} aria-hidden="true" />
                <h3>Intelligence rules</h3>
                <p>
                  The signals, the alerts, the brief and the seven guided answers are plain functions over the snapshot. No model is needed to run them.{" "}
                  <a href={`${BRAND.repoUrl}/blob/${BRAND.repoBranch}/src/server/intelligence.ts`} target="_blank" rel="noreferrer">
                    src/server/intelligence.ts ↗
                  </a>
                </p>
              </article>
            </div>
            <div className={styles.codeGrid}>
              <figure className={styles.codeBlock}>
                <figcaption>scripts/verify.ts · the fee split, checked against the vault counters</figcaption>
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
                <figcaption>src/server/intelligence.ts · where a price sits in its range</figcaption>
                <pre>{`const rangePosition = (price - lower) / (upper - lower); // 0 → lower bound, 1 → upper
if (inRange === false) flags.push("out of range");
else if (rangePosition < 0.15 || rangePosition > 0.85)
  flags.push(rangePosition < 0.15 ? "near lower bound" : "near upper bound");
if (oracleAgeSeconds > 26 * 3600) flags.push("oracle stale");`}</pre>
              </figure>
            </div>
            <div className={styles.codeGrid}>
              <figure className={styles.codeBlock}>
                <figcaption>Run it yourself</figcaption>
                <pre>{`git clone ${BRAND.repoUrl}.git vertex
cd vertex && npm install
npm run dev        # the site on http://localhost:3000
npm run verify     # the same checks /verify publishes`}</pre>
              </figure>
              <div className={styles.codeNote}>
                <h3>What you will find</h3>
                <p>A Next.js app with no database and no backend beyond the chain: server routes read Robinhood Chain and cache for seconds, pages render from those reads, and the wallet signs every transaction locally. Issues and pull requests are open.</p>
                <a className="btn btn-primary" href={BRAND.repoUrl} target="_blank" rel="noreferrer">
                  Open the repository <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            </div>
          </section>

          <section className={styles.section} id="roadmap">
            <div className={styles.sectionLabel}>08 · Roadmap</div>
            <div className={styles.sectionIntro}>
              <h2>Vaults are the foundation, not the finish line.</h2>
              <p>The roadmap connects liquidity, credit, and strategy automation into a broader onchain financial toolkit.</p>
            </div>
            <div className={styles.roadmap}>
              {[
                ["01", "Ongoing", "Expand vaults and lending", "Grow supported markets carefully, deepen the lending experience, and make portfolio management feel seamless across both products.", "sparkles"],
                ["02", "Next strategy", "Delta-neutral strategy", "Introduce a strategy designed to collect opportunities from the market while reducing directional exposure.", "sparkles"],
                ["03", "Planned", "Vault + lending loop", "Combine vault positions with lending in a guided looping strategy built to pursue a higher blended return.", "sparkles"],
                ["04", "In development", "A new AI × DeFi experience", "A new feature is being built around AI, DeFi, and Uniswap V4 hooks. Development is expected to take about 30 days, with more revealed closer to release.", "bot"],
              ].map(([n, stage, h, p, icon]) => (
                <article key={n}>
                  <div className={styles.roadmapMarker}>{icon === "bot" ? <Bot size={20} aria-hidden="true" /> : <Sparkles size={20} aria-hidden="true" />}</div>
                  <div>
                    <span>
                      {n} · {stage}
                    </span>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} id="faq">
            <div className={styles.sectionLabel}>09 · FAQ</div>
            <div className={styles.faq}>
              <details>
                <summary>What do I receive when I deposit?</summary>
                <p>You receive transferable vault shares representing your portion of that vault’s assets and activity.</p>
              </details>
              <details>
                <summary>Where does vault performance come from?</summary>
                <p>Vaults seek to earn fees by supplying useful liquidity to tokenized-stock markets. Results change with activity, positioning, and market conditions.</p>
              </details>
              <details>
                <summary>What happens when stock markets are closed?</summary>
                <p>Deposits and automated price-dependent actions can pause when Chainlink stock prices are not current. You can still exit into your proportional underlying tokens; conversion of stock into USDG resumes when protected pricing is available.</p>
              </details>
              <details>
                <summary>How do vault fees support the {token}?</summary>
                <p>Of the liquidity fees earned by a vault, 70% stays with the vault, 20% is reserved to buy and permanently burn the {token}, and 10% goes to the protocol treasury.</p>
              </details>
              <details>
                <summary>How does lending fit in?</summary>
                <p>Lending is being introduced as a companion to the vaults. It will let supported vault shares serve as collateral while USDG suppliers can earn borrower-funded interest.</p>
              </details>
              <details>
                <summary>Where can I follow product updates?</summary>
                <p>
                  Follow{" "}
                  <a href={BRAND.xUrl} target="_blank" rel="noreferrer">
                    @{BRAND.xHandle}
                  </a>{" "}
                  and return to this page as new markets and strategies are released.
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
