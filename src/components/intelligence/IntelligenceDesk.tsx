"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Send } from "lucide-react";
import { StockLogo } from "@/components/StockLogo";
import type { Brief, IntelligenceSignals, VaultSignal } from "@/server/intelligence";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { formatPercent, formatUtc } from "@/lib/format";
import styles from "@/styles/intelligence-desk.module.css";

type Payload = { analyst: "online" | "offline"; signals: IntelligenceSignals; brief: Brief | null; guided: readonly { id: string; label: string }[] };

const usd = (n: number, d = 0) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d });
const age = (t: TFunction, s: number | null) => (s === null ? "–" : s < 3600 ? t("card.age.min", { n: Math.round(s / 60) }) : t("card.age.hours", { n: (s / 3600).toFixed(1) }));

/** Guided question ids are fixed on the server; only the button label is localised here. */
const GUIDED_IDS = new Set(["edge", "ranking", "fees", "oracle", "paused", "lending", "size"]);
const guidedLabel = (t: TFunction, q: { id: string; label: string }) => (GUIDED_IDS.has(q.id) ? t(`guided.${q.id}`) : q.label);
const alertLevel = (t: TFunction, level: string) => (level === "watch" ? t("alert.watch") : level === "info" ? t("alert.info") : level);

function VaultCard({ v }: { v: VaultSignal }) {
  const t = useT("intelligence");
  const pos = v.rangePosition;
  const clamped = pos === null ? null : Math.min(1.04, Math.max(-0.04, pos));
  const cls = v.inRange === false ? styles.out : v.flags.some((f) => f.startsWith("near") || f === "oracle stale") ? styles.flag : "";
  return (
    <article className={`${styles.vault} ${cls}`}>
      <div className={styles.vaultHead}>
        <StockLogo symbol={v.symbol} size={28} />
        <b>{v.symbol}</b>
        <small>{v.apr === null ? t("card.noWindow") : t("card.feeApr", { apr: formatPercent(v.apr) })}</small>
      </div>
      <div>
        <div className={styles.range} aria-label={pos === null ? t("card.range.unknown") : t("card.range.at", { pct: Math.round(pos * 100) })}>
          {pos !== null ? <em style={{ left: `${Math.max(0, Math.min(100, (pos < 0.5 ? pos : 0.5) * 100))}%`, width: `${Math.abs(0.5 - Math.max(0, Math.min(1, pos))) * 100}%` }} /> : null}
          {clamped !== null ? <i style={{ left: `${((clamped + 0.04) / 1.08) * 100}%` }} /> : null}
        </div>
        <div className={styles.rangeLabels}>
          <span>{v.lower === null ? "–" : usd(v.lower, 2)}</span>
          <span>{v.price === null ? "–" : usd(v.price, 2)}</span>
          <span>{v.upper === null ? "–" : usd(v.upper, 2)}</span>
        </div>
      </div>
      <div className={styles.kv}>
        <span>
          {t("card.assets")} <b>{v.tvl === null ? "–" : usd(v.tvl)}</b>
        </span>
        <span>
          {t("card.oracle")} <b>{age(t, v.oracleAgeSeconds)}</b>
        </span>
        <span>
          {t("card.feesToDate")} <b>{v.lifetimeFees === null ? "–" : usd(v.lifetimeFees, 2)}</b>
        </span>
        <span>
          {t("card.rangeWidth")} <b>{v.rangeWidthPct === null ? "–" : `${v.rangeWidthPct.toFixed(1)}%`}</b>
        </span>
      </div>
      {v.flags.length ? (
        <div className={styles.flags}>
          {v.flags.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      ) : null}
      <Link href={v.href} className={styles.muted}>
        {t("card.open")}
      </Link>
    </article>
  );
}

export function IntelligenceDesk({ initial }: { initial: Payload | null }) {
  const t = useT("intelligence");
  const [data, setData] = useState<Payload | null>(initial);
  const [error, setError] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string; source: "rules" | "model" } | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/intelligence", { cache: "no-store" });
      if (!r.ok) throw new Error();
      setData((await r.json()) as Payload);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    if (!initial) void refresh();
    const i = setInterval(() => document.visibilityState === "visible" && void refresh(), 60_000);
    return () => clearInterval(i);
  }, [refresh, initial]);

  async function guided(id: string, label: string) {
    if (asking) return;
    setAsking(true);
    setAskError("");
    try {
      const r = await fetch(`/api/intelligence/answer?q=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = (await r.json()) as { data?: { answer: string }; error?: string };
      if (!r.ok || !j.data) throw new Error(j.error ?? "");
      setAnswer({ q: label, a: j.data.answer, source: "rules" });
    } catch (e) {
      setAskError(e instanceof Error && e.message ? e.message : t("ask.error.guided"));
    } finally {
      setAsking(false);
    }
  }

  async function submit(q: string) {
    const text = q.trim();
    if (text.length < 3 || asking) return;
    setAsking(true);
    setAskError("");
    try {
      const r = await fetch("/api/intelligence/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }) });
      const j = (await r.json()) as { data?: { answer: string; model: string }; error?: string };
      if (!r.ok || !j.data) throw new Error(j.error ?? "");
      setAnswer({ q: text, a: j.data.answer, source: "model" });
      setQuestion("");
    } catch (e) {
      setAskError(e instanceof Error && e.message ? e.message : t("ask.error.free"));
    } finally {
      setAsking(false);
    }
  }

  const s = data?.signals;
  const online = data?.analyst === "online";
  const sorted = s ? [...s.vaults].sort((a, b) => (b.flags.length - a.flags.length) || (b.apr ?? -1) - (a.apr ?? -1)) : [];

  return (
    <div className={styles.page}>
      <div className={styles.grid2}>
        <section className={`${styles.panel} ${styles.dark}`} aria-labelledby="brief-heading">
          <div className={styles.head}>
            <div>
              <p className={`eyebrow ${styles.eyebrow}`}>{t("brief.eyebrow")}</p>
              <h2 id="brief-heading">{t("brief.title")}</h2>
            </div>
            <span className={styles.pill}>
              <i aria-hidden="true" /> {data?.brief?.source === "model" ? t("brief.pill.model") : t("brief.pill.rules")}
            </span>
          </div>
          {data?.brief ? (
            <>
              <div className={styles.brief}>
                <p>{data.brief.text}</p>
              </div>
              {data.brief.watch.length ? (
                <ul className={styles.watch}>
                  {data.brief.watch.map((w) => (
                    <li key={w.symbol + w.note}>
                      <b>{w.symbol}</b>
                      <span>{w.note}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className={styles.meta}>
                {data.brief.source === "model" ? t("brief.meta.model", { model: data.brief.model ?? "" }) : t("brief.meta.rules")}
                {t("brief.meta.rest", { time: formatUtc(data.brief.generatedAt), block: s?.block ?? "–" })}
              </p>
            </>
          ) : (
            <div className={styles.offline}>{error ? t("feed.error") : t("brief.loading")}</div>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="totals-heading">
          <div className={styles.head}>
            <div>
              <p className="eyebrow">{t("signals.eyebrow")}</p>
              <h2 id="totals-heading">{t("signals.title")}</h2>
            </div>
            <span className={styles.pill}>
              <i aria-hidden="true" /> {s ? t("signals.pill.block", { block: s.block ?? "–" }) : error ? t("signals.pill.unavailable") : t("signals.pill.reading")}
            </span>
          </div>
          {s ? (
            <>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span>{t("signals.assets")}</span>
                  <strong>{usd(s.totals.tvl)}</strong>
                </div>
                <div className={styles.stat}>
                  <span>{t("signals.feesToDate")}</span>
                  <strong>{usd(s.totals.lifetimeFees)}</strong>
                </div>
                <div className={styles.stat}>
                  <span>{t("signals.open")}</span>
                  <strong>{s.totals.open} / 18</strong>
                </div>
                <div className={styles.stat}>
                  <span>{t("signals.nearEdge")}</span>
                  <strong>{s.totals.nearEdge + s.totals.outOfRange}</strong>
                </div>
              </div>
              {s.lending ? (
                <p className={styles.muted} style={{ marginTop: 14 }}>
                  {t("signals.lending", {
                    name: s.lending.name,
                    state: s.lending.state.toLowerCase(),
                    supplied: usd(s.lending.supplied),
                    borrowed: usd(s.lending.borrowed),
                    util: s.lending.utilisationPct.toFixed(1),
                    borrowApr: formatPercent(s.lending.borrowApr),
                    supplyApr: formatPercent(s.lending.supplyApr),
                  })}
                </p>
              ) : null}
              <ul className={styles.alerts} aria-label={t("signals.alerts.aria")}>
                {s.alerts.slice(0, 8).map((a) => (
                  <li key={a.text} className={a.level === "watch" ? styles.watch : ""}>
                    <b>{alertLevel(t, a.level)}</b>
                    <span>{a.text}</span>
                  </li>
                ))}
                {s.alerts.length === 0 ? <li>{t("signals.alerts.none")}</li> : null}
              </ul>
            </>
          ) : (
            <p className={styles.muted}>{error ? t("feed.error") : t("signals.loading")}</p>
          )}
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="ask-heading">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t("ask.eyebrow")}</p>
            <h2 id="ask-heading">{t("ask.title")}</h2>
          </div>
          <span className={styles.pill}>
            <i aria-hidden="true" /> {online ? t("ask.pill.online") : t("ask.pill.offline")}
          </span>
        </div>
        <div className={styles.ask}>
          <div className={styles.chips}>
            {(data?.guided ?? []).map((q) => (
              <button key={q.id} type="button" disabled={asking || !data} onClick={() => void guided(q.id, guidedLabel(t, q))}>
                {guidedLabel(t, q)}
              </button>
            ))}
          </div>
          {online ? (
            <form
              className={styles.askRow}
              onSubmit={(e) => {
                e.preventDefault();
                void submit(question);
              }}
            >
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={400} placeholder={t("ask.placeholder")} disabled={asking} aria-label={t("ask.label")} />
              <button type="submit" className="hex hex-green" disabled={asking || question.trim().length < 3}>
                {asking ? t("ask.thinking") : t("ask.submit")} <Send size={14} aria-hidden="true" />
              </button>
            </form>
          ) : null}
          {askError ? <p className={`${styles.muted} ${styles.err}`}>{askError}</p> : null}
          {answer ? (
            <div className={styles.answer}>
              <p className={styles.muted} style={{ marginBottom: 8 }}>
                {answer.q}
              </p>
              {answer.a}
              <p className={styles.muted} style={{ marginTop: 10 }}>
                {answer.source === "rules" ? t("answer.source.rules") : t("answer.source.model")}
              </p>
            </div>
          ) : null}
          <p className={styles.muted}>
            {t("ask.note.1")}
            {online ? t("ask.note.online") : ""}
            {t("ask.note.2")}
          </p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="vaults-heading">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t("vaults.eyebrow")}</p>
            <h2 id="vaults-heading">{t("vaults.title")}</h2>
          </div>
          <p className={styles.muted}>{t("vaults.note")}</p>
        </div>
        <div className={styles.vaults}>
          {sorted.map((v) => (
            <VaultCard key={v.id} v={v} />
          ))}
        </div>
        <p className={styles.muted} style={{ marginTop: 16 }}>
          {t("vaults.updated", { time: s ? formatUtc(s.generatedAt) : "–" })}{" "}
          <Link href="/verify">
            {t("vaults.verify")} <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </p>
      </section>
    </div>
  );
}
