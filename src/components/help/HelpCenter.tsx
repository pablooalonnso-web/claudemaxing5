"use client";

import Link from "next/link";
import { Activity, ArrowRight, BookOpen, LifeBuoy, Plus, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useT } from "@/i18n/client";
import styles from "@/styles/help.module.css";

type Topic = "getting-started" | "deposits" | "withdrawals" | "transactions" | "safety";
type AnswerMeta = { id: string; topic: Topic; paragraphs: number; href: string };
type Answer = { id: string; topic: Topic; question: string; summary: string; body: string[]; cta: { label: string; href: string } };

const TOPICS: Topic[] = ["getting-started", "deposits", "withdrawals", "transactions", "safety"];

/** Static shape of the library; the text lives in the `help` message tables under `answer.<id>.*`. */
export const ANSWERS: AnswerMeta[] = [
  { id: "first-deposit", topic: "getting-started", paragraphs: 3, href: "/vaults" },
  { id: "connect-wallet", topic: "getting-started", paragraphs: 2, href: "/portfolio" },
  { id: "deposit-amount", topic: "deposits", paragraphs: 2, href: "/portfolio" },
  { id: "deposit-paused", topic: "deposits", paragraphs: 2, href: "/status" },
  { id: "withdraw-position", topic: "withdrawals", paragraphs: 3, href: "/portfolio" },
  { id: "weekend-withdrawal", topic: "withdrawals", paragraphs: 2, href: "/docs#oracles" },
  { id: "pending-transaction", topic: "transactions", paragraphs: 2, href: "/status" },
  { id: "failed-transaction", topic: "transactions", paragraphs: 2, href: "/portfolio" },
  { id: "fees-and-return", topic: "deposits", paragraphs: 2, href: "/docs" },
  { id: "safe-support", topic: "safety", paragraphs: 3, href: "/help/contact" },
];

export function HelpCenter() {
  const t = useT("help");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const answers = useMemo<Answer[]>(
    () =>
      ANSWERS.map((a) => ({
        id: a.id,
        topic: a.topic,
        question: t(`answer.${a.id}.question`),
        summary: t(`answer.${a.id}.summary`),
        body: Array.from({ length: a.paragraphs }, (_, i) => t(`answer.${a.id}.body.${i + 1}`, { brand: BRAND.name })),
        cta: { label: t(`answer.${a.id}.cta`), href: a.href },
      })),
    [t],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return answers.filter((a) => (topic === "all" || a.topic === topic) && (!q || `${a.question} ${a.summary} ${a.body.join(" ")}`.toLowerCase().includes(q)));
  }, [answers, query, topic]);
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{t("hero.eyebrow", { brand: BRAND.nameUpper })}</p>
          <h1>
            {t("hero.title.before")}
            <br />
            <em>{t("hero.title.em")}</em>
          </h1>
          <p className={styles.intro}>{t("hero.intro")}</p>
          <a href="#answers-heading" className={styles.heroLink}>
            {t("hero.cta")} <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div />
          <LifeBuoy size={24} strokeWidth={0.8} />
          <span>{t("hero.art")}</span>
        </div>
      </section>
      <nav className={styles.quickLinks} aria-label={t("quick.aria")}>
        <Link href="/docs">
          <BookOpen size={23} aria-hidden="true" />
          <span>
            <strong>{t("quick.docs.title")}</strong>
            <small>{t("quick.docs.sub")}</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link href="/status">
          <Activity size={23} aria-hidden="true" />
          <span>
            <strong>{t("quick.status.title")}</strong>
            <small>{t("quick.status.sub")}</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link href="/help/contact">
          <LifeBuoy size={23} aria-hidden="true" />
          <span>
            <strong>{t("quick.contact.title")}</strong>
            <small>{t("quick.contact.sub")}</small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </nav>
      <section className={styles.library} aria-labelledby="answers-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>{t("library.eyebrow")}</p>
            <h2 id="answers-heading">{t("library.title")}</h2>
          </div>
          <span className={styles.resultCount} role="status">
            {t(results.length === 1 ? "library.count.one" : "library.count.other", { count: results.length })}
          </span>
        </div>
        <label className={styles.search}>
          <Search size={21} aria-hidden="true" />
          <span className={styles.srOnly}>{t("search.label")}</span>
          <input type="search" maxLength={200} placeholder={t("search.placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className={styles.filters} role="group" aria-label={t("filters.aria")}>
          <button type="button" aria-pressed={topic === "all"} onClick={() => setTopic("all")}>
            {t("filters.all")}
          </button>
          {TOPICS.map((id) => (
            <button key={id} type="button" aria-pressed={topic === id} onClick={() => setTopic(id)}>
              {t(`topic.${id}`)}
            </button>
          ))}
        </div>
        <div className={styles.answers}>
          {results.length === 0 ? (
            <div className={styles.empty}>
              <h3>{t("empty.title")}</h3>
              <p>{t("empty.body")}</p>
            </div>
          ) : (
            results.map((a) => (
              <details key={a.id} id={a.id} className={styles.answer}>
                <summary>
                  <span>
                    <small>{t(`topic.${a.topic}`)}</small>
                    <strong>{a.question}</strong>
                    <span>{a.summary}</span>
                  </span>
                  <Plus size={20} aria-hidden="true" />
                </summary>
                <div className={styles.answerBody}>
                  {a.body.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                  <Link href={a.cta.href}>
                    {a.cta.label}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </details>
            ))
          )}
        </div>
      </section>
      <section className={styles.supportBand}>
        <div>
          <p className={styles.eyebrow}>{t("support.eyebrow")}</p>
          <h2>{t("support.title")}</h2>
          <p>{t("support.body")}</p>
        </div>
        <Link className={styles.primaryLink} href="/help/contact">
          {t("support.cta")} <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
      <aside className={styles.safety}>
        <ShieldCheck size={23} aria-hidden="true" />
        <p>
          <strong>{t("safety.strong")}</strong>
          {t("safety.body")}
        </p>
      </aside>
    </div>
  );
}
