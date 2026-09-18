import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Radio, ShieldOff } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getT } from "@/i18n/server";
import { BRAND } from "@/lib/brand";
import { EXPLORER_URL } from "@/lib/chain";
import { formatUtc } from "@/lib/format";
import type { VerificationReport, VerificationStatus } from "@/lib/verification";
import report from "../../../public/verification/latest.json";
import styles from "@/styles/verify.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("verify");
  return { title: `${t("meta.title")} · ${BRAND.name}`, description: t("meta.description", { brand: BRAND.name }) };
}

const data = report as VerificationReport;

function worst(statuses: VerificationStatus[]): VerificationStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

export default async function VerifyPage() {
  const t = await getT("verify");
  const LABEL: Record<VerificationStatus, string> = { pass: t("status.pass"), fail: t("status.fail"), warn: t("status.warn"), skip: t("status.skip") };
  const runDate = data.generatedAt.slice(0, 10);
  return (
    <main className="app-page">
      <SiteHeader />
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{t("hero.eyebrow", { date: runDate })}</p>
            <h1>
              {t("hero.title.before")}
              <br />
              <em>{t("hero.title.em")}</em>
            </h1>
            <p>{t("hero.intro")}</p>
          </div>
          <div className={styles.scorecard}>
            <div className={styles.score} aria-label={t("summary.aria")}>
              <div className={styles.pass}>
                <strong>{data.summary.pass}</strong>
                <span>{t("summary.pass")}</span>
              </div>
              <div className={styles.fail}>
                <strong>{data.summary.fail}</strong>
                <span>{t("summary.fail")}</span>
              </div>
              <div>
                <strong>{data.summary.warn + data.summary.skip}</strong>
                <span>{t("summary.warnSkip")}</span>
              </div>
            </div>
            <dl className={styles.meta}>
              <div>
                <span>{t("meta.runAt")}</span>
                <strong>{formatUtc(data.generatedAt)}</strong>
              </div>
              <div>
                <span>{t("meta.chainHead")}</span>
                <strong>
                  <a href={`${EXPLORER_URL}/block/${data.chain.head}`} target="_blank" rel="noopener noreferrer">
                    {t("meta.block", { block: data.chain.head })}
                  </a>
                </strong>
              </div>
              <div>
                <span>{t("meta.site")}</span>
                <strong>{data.site ? new URL(data.site).host : t("meta.skipped")}</strong>
              </div>
              <div>
                <span>{t("meta.commit")}</span>
                <strong>{data.commit ? data.commit.slice(0, 7) : t("meta.unknown")}</strong>
              </div>
            </dl>
          </div>
        </header>

        <section className={styles.scope} aria-label={t("scope.aria")}>
          <article>
            <Radio size={22} aria-hidden="true" />
            <h2>{t("scope.covers.title")}</h2>
            <p>{t("scope.covers.body")}</p>
          </article>
          <article>
            <FlaskConical size={22} aria-hidden="true" />
            <h2>{t("scope.runs.title")}</h2>
            <p>{t("scope.runs.body")}</p>
          </article>
          <article className={styles.not}>
            <ShieldOff size={22} aria-hidden="true" />
            <h2>{t("scope.not.title")}</h2>
            <p>{t("scope.not.body", { brand: BRAND.name })}</p>
          </article>
        </section>

        <nav className={styles.toc} aria-label={t("toc.aria")}>
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
                  {t("counts.pass", { n: counts.pass })}
                  {counts.fail ? t("counts.fail", { n: counts.fail }) : ""}
                  {counts.warn ? t("counts.warn", { n: counts.warn }) : ""}
                  {counts.skip ? t("counts.skip", { n: counts.skip }) : ""}
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
            <p className={styles.eyebrow}>{t("repro.eyebrow")}</p>
            <h2 id="repro-heading">{t("repro.title")}</h2>
            <p>
              {t("repro.p1.before")}
              <code>scripts/verify.ts</code>
              {t("repro.p1.after")}
            </p>
            <p>
              {t("repro.p2.before")}
              <a href="/verification/latest.json">/verification/latest.json</a>
              {t("repro.p2.middle")}
              <a href={BRAND.xUrl} target="_blank" rel="noopener noreferrer">
                @{BRAND.xHandle}
              </a>
              {t("repro.p2.or")}
              <Link href="/help/contact">{t("repro.p2.link")}</Link>
              {t("repro.p2.after")}
            </p>
          </div>
          <pre>
            <b>$</b> git clone https://github.com/pablooalonnso-web/claudemaxing5.git vertex{"\n"}
            <b>$</b> cd vertex && npm install{"\n"}
            <b>$</b> npm run verify{"\n"}
            {"\n"}
            <b>#</b> {t("repro.comment.chainOnly")}{"\n"}
            <b>$</b> npm run verify -- --no-site{"\n"}
            {"\n"}
            <b>#</b> {t("repro.comment.build")}{"\n"}
            <b>$</b> npm run verify -- --build
          </pre>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
