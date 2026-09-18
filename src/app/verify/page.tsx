import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Radio, ShieldOff } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/lib/brand";
import { EXPLORER_URL } from "@/lib/chain";
import { formatUtc } from "@/lib/format";
import type { VerificationReport, VerificationStatus } from "@/lib/verification";
import report from "../../../public/verification/latest.json";
import styles from "@/styles/verify.module.css";

export const metadata: Metadata = {
  title: `Verification · ${BRAND.name}`,
  description: `Automated functional verification of the ${BRAND.name} contracts and site, with the script to reproduce it.`,
};

const data = report as VerificationReport;
const LABEL: Record<VerificationStatus, string> = { pass: "Pass", fail: "Fail", warn: "Warn", skip: "Skipped" };

function worst(statuses: VerificationStatus[]): VerificationStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

export default function VerifyPage() {
  const runDate = data.generatedAt.slice(0, 10);
  return (
    <main className="app-page">
      <SiteHeader />
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Verification · run {runDate}</p>
            <h1>
              Every check,
              <br />
              <em>in the open.</em>
            </h1>
            <p>
              We run the same reads, quotes and router calls the app makes, against the live contracts on Robinhood Chain and the production site, and publish the
              result with the script that produced it. Deposits and withdrawals are executed inside the node as simulations. No transaction is signed.
            </p>
          </div>
          <div className={styles.scorecard}>
            <div className={styles.score} aria-label="Summary">
              <div className={styles.pass}>
                <strong>{data.summary.pass}</strong>
                <span>Pass</span>
              </div>
              <div className={styles.fail}>
                <strong>{data.summary.fail}</strong>
                <span>Fail</span>
              </div>
              <div>
                <strong>{data.summary.warn + data.summary.skip}</strong>
                <span>Warn or skipped</span>
              </div>
            </div>
            <dl className={styles.meta}>
              <div>
                <span>Run at</span>
                <strong>{formatUtc(data.generatedAt)}</strong>
              </div>
              <div>
                <span>Chain head</span>
                <strong>
                  <a href={`${EXPLORER_URL}/block/${data.chain.head}`} target="_blank" rel="noopener noreferrer">
                    Block {data.chain.head}
                  </a>
                </strong>
              </div>
              <div>
                <span>Site checked</span>
                <strong>{data.site ? new URL(data.site).host : "Skipped"}</strong>
              </div>
              <div>
                <span>Site commit</span>
                <strong>{data.commit ? data.commit.slice(0, 7) : "Unknown"}</strong>
              </div>
            </dl>
          </div>
        </header>

        <section className={styles.scope} aria-label="Scope">
          <article>
            <Radio size={22} aria-hidden="true" />
            <h2>What it covers</h2>
            <p>Chain and contract wiring, live state of all 18 vaults, the fee counters, a deposit and two withdrawal paths per vault, the lending market, swap routing, and every page and API on the site.</p>
          </article>
          <article>
            <FlaskConical size={22} aria-hidden="true" />
            <h2>How it runs</h2>
            <p>A throwaway account is handed a USDG balance and allowance through eth_call state overrides so the router can execute end to end inside the node. The numbers are the node&apos;s answers, not ours.</p>
          </article>
          <article className={styles.not}>
            <ShieldOff size={22} aria-hidden="true" />
            <h2>What it is not</h2>
            <p>This is not a third-party security audit and does not prove the contracts are free of bugs. {BRAND.name} has not commissioned an independent audit of the vault contracts. Verify before you deposit.</p>
          </article>
        </section>

        <nav className={styles.toc} aria-label="Sections">
          {data.groups.map((g) => {
            const tone = worst(g.checks.map((c) => c.status));
            return (
              <a key={g.id} href={`#${g.id}`}>
                <i className={tone === "pass" ? "" : styles[tone]} aria-hidden="true" />
                {g.title} · {g.checks.length}
              </a>
            );
          })}
        </nav>

        {data.groups.map((g) => {
          const counts = g.checks.reduce(
            (acc, c) => ((acc[c.status] += 1), acc),
            { pass: 0, fail: 0, warn: 0, skip: 0 } as Record<VerificationStatus, number>,
          );
          return (
            <section key={g.id} className={styles.group} id={g.id} aria-labelledby={`${g.id}-heading`}>
              <div className={styles.groupHead}>
                <div>
                  <h2 id={`${g.id}-heading`}>{g.title}</h2>
                  <p>{g.description}</p>
                </div>
                <small>
                  {counts.pass} pass{counts.fail ? ` · ${counts.fail} fail` : ""}
                  {counts.warn ? ` · ${counts.warn} warn` : ""}
                  {counts.skip ? ` · ${counts.skip} skipped` : ""}
                </small>
              </div>
              <div className={styles.table} role="table">
                {g.checks.map((c) => (
                  <div key={c.name} className={styles.row} role="row">
                    <strong role="cell">{c.name}</strong>
                    <span role="cell" className={`${styles.tag} ${styles[c.status] ?? ""}`}>
                      {LABEL[c.status]}
                    </span>
                    <p role="cell">{c.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <section className={styles.repro} aria-labelledby="repro-heading">
          <div>
            <p className={styles.eyebrow}>Reproduce it</p>
            <h2 id="repro-heading">Run the same checks yourself.</h2>
            <p>
              The script lives in the site repository as <code>scripts/verify.ts</code>. It needs Node 22 and nothing else: no keys, no wallet, no API token. Point it at
              any RPC for Robinhood Chain with NEXT_PUBLIC_RPC_URL if you do not trust the default.
            </p>
            <p>
              The raw result of this run is at <a href="/verification/latest.json">/verification/latest.json</a>. Questions go to{" "}
              <a href={BRAND.xUrl} target="_blank" rel="noopener noreferrer">
                @{BRAND.xHandle}
              </a>{" "}
              or the <Link href="/help/contact">contact page</Link>.
            </p>
          </div>
          <pre>
            <b>$</b> git clone https://github.com/pablooalonnso-web/claudemaxing5.git vertex{"\n"}
            <b>$</b> cd vertex && npm install{"\n"}
            <b>$</b> npm run verify{"\n"}
            {"\n"}
            <b>#</b> chain only, no site checks{"\n"}
            <b>$</b> npm run verify -- --no-site{"\n"}
            {"\n"}
            <b>#</b> also typecheck and lint the site{"\n"}
            <b>$</b> npm run verify -- --build
          </pre>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
