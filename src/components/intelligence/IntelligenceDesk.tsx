"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Send } from "lucide-react";
import { StockLogo } from "@/components/StockLogo";
import type { Brief, IntelligenceSignals, VaultSignal } from "@/server/intelligence";
import { formatPercent, formatUtc } from "@/lib/format";
import styles from "@/styles/intelligence-desk.module.css";

type Payload = { analyst: "online" | "offline"; signals: IntelligenceSignals; brief: Brief | null; guided: readonly { id: string; label: string }[] };

const usd = (n: number, d = 0) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: d });
const age = (s: number | null) => (s === null ? "–" : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

function VaultCard({ v }: { v: VaultSignal }) {
  const pos = v.rangePosition;
  const clamped = pos === null ? null : Math.min(1.04, Math.max(-0.04, pos));
  const cls = v.inRange === false ? styles.out : v.flags.some((f) => f.startsWith("near") || f === "oracle stale") ? styles.flag : "";
  return (
    <article className={`${styles.vault} ${cls}`}>
      <div className={styles.vaultHead}>
        <StockLogo symbol={v.symbol} size={28} />
        <b>{v.symbol}</b>
        <small>{v.apr === null ? "no window" : `${formatPercent(v.apr)} fee APR`}</small>
      </div>
      <div>
        <div className={styles.range} aria-label={pos === null ? "Range unknown" : `Price at ${Math.round(pos * 100)}% of the range`}>
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
          Assets <b>{v.tvl === null ? "–" : usd(v.tvl)}</b>
        </span>
        <span>
          Oracle <b>{age(v.oracleAgeSeconds)}</b>
        </span>
        <span>
          Fees to date <b>{v.lifetimeFees === null ? "–" : usd(v.lifetimeFees, 2)}</b>
        </span>
        <span>
          Range width <b>{v.rangeWidthPct === null ? "–" : `${v.rangeWidthPct.toFixed(1)}%`}</b>
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
        Open vault ↗
      </Link>
    </article>
  );
}

export function IntelligenceDesk({ initial }: { initial: Payload | null }) {
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
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh, initial]);

  async function guided(id: string, label: string) {
    if (asking) return;
    setAsking(true);
    setAskError("");
    try {
      const r = await fetch(`/api/intelligence/answer?q=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = (await r.json()) as { data?: { answer: string }; error?: string };
      if (!r.ok || !j.data) throw new Error(j.error ?? "Could not compute that answer.");
      setAnswer({ q: label, a: j.data.answer, source: "rules" });
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Could not compute that answer.");
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
      if (!r.ok || !j.data) throw new Error(j.error ?? "The analyst could not answer.");
      setAnswer({ q: text, a: j.data.answer, source: "model" });
      setQuestion("");
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "The analyst could not answer.");
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
              <p className={`eyebrow ${styles.eyebrow}`}>The brief</p>
              <h2 id="brief-heading">What the chain says right now.</h2>
            </div>
            <span className={styles.pill}>
              <i aria-hidden="true" /> {data?.brief?.source === "model" ? "Model reading" : "Computed · rules, not a model"}
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
                {data.brief.source === "model" ? `Written by ${data.brief.model} ` : "Assembled by rules "}
                {formatUtc(data.brief.generatedAt)} from signals read at block {s?.block ?? "–"}. Not financial advice.
              </p>
            </>
          ) : (
            <div className={styles.offline}>{error ? "The signal feed could not be read. It retries every minute." : "Reading the vaults and writing the brief…"}</div>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="totals-heading">
          <div className={styles.head}>
            <div>
              <p className="eyebrow">Signals</p>
              <h2 id="totals-heading">Across the 18 vaults.</h2>
            </div>
            <span className={styles.pill}>
              <i aria-hidden="true" /> {s ? `Block ${s.block ?? "–"}` : error ? "Feed unavailable" : "Reading…"}
            </span>
          </div>
          {s ? (
            <>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <span>Assets</span>
                  <strong>{usd(s.totals.tvl)}</strong>
                </div>
                <div className={styles.stat}>
                  <span>Fees to date</span>
                  <strong>{usd(s.totals.lifetimeFees)}</strong>
                </div>
                <div className={styles.stat}>
                  <span>Open</span>
                  <strong>{s.totals.open} / 18</strong>
                </div>
                <div className={styles.stat}>
                  <span>Near an edge</span>
                  <strong>{s.totals.nearEdge + s.totals.outOfRange}</strong>
                </div>
              </div>
              {s.lending ? (
                <p className={styles.muted} style={{ marginTop: 14 }}>
                  Lending: {s.lending.name} {s.lending.state.toLowerCase()}, {usd(s.lending.supplied)} supplied, {usd(s.lending.borrowed)} borrowed, {s.lending.utilisationPct.toFixed(1)}% utilised, borrow{" "}
                  {formatPercent(s.lending.borrowApr)}, supply {formatPercent(s.lending.supplyApr)}.
                </p>
              ) : null}
              <ul className={styles.alerts} aria-label="Alerts">
                {s.alerts.slice(0, 8).map((a) => (
                  <li key={a.text} className={a.level === "watch" ? styles.watch : ""}>
                    <b>{a.level}</b>
                    <span>{a.text}</span>
                  </li>
                ))}
                {s.alerts.length === 0 ? <li>Nothing flagged. Every vault is inside its range with a fresh feed.</li> : null}
              </ul>
            </>
          ) : (
            <p className={styles.muted}>{error ? "The signal feed could not be read. It retries every minute." : "Reading the vaults…"}</p>
          )}
        </section>
      </div>

      <section className={styles.panel} aria-labelledby="ask-heading">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">Ask</p>
            <h2 id="ask-heading">Question the numbers.</h2>
          </div>
          <span className={styles.pill}>
            <i aria-hidden="true" /> {online ? "Guided answers computed · free text via model" : "Answers computed from the signals"}
          </span>
        </div>
        <div className={styles.ask}>
          <div className={styles.chips}>
            {(data?.guided ?? []).map((q) => (
              <button key={q.id} type="button" disabled={asking || !data} onClick={() => void guided(q.id, q.label)}>
                {q.label}
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
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={400} placeholder="Or ask in your own words…" disabled={asking} aria-label="Your question" />
              <button type="submit" className="hex hex-green" disabled={asking || question.trim().length < 3}>
                {asking ? "Thinking…" : "Ask"} <Send size={14} aria-hidden="true" />
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
                {answer.source === "rules" ? "Computed from the signals by rules. No model involved." : "Written by a language model that only sees the signals on this page."}
              </p>
            </div>
          ) : null}
          <p className={styles.muted}>
            Guided answers are computed on the server from the same signals shown here, read from the chain a moment earlier.
            {online ? " Free-text questions go to a language model that sees only those signals." : ""} Everything describes and compares; nothing here advises. Vault shares move with the stock price.
          </p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="vaults-heading">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">Vault by vault</p>
            <h2 id="vaults-heading">Where each price sits in its range.</h2>
          </div>
          <p className={styles.muted}>Marker is the pool price between the range bounds. Flagged vaults first. Refreshed every minute.</p>
        </div>
        <div className={styles.vaults}>
          {sorted.map((v) => (
            <VaultCard key={v.id} v={v} />
          ))}
        </div>
        <p className={styles.muted} style={{ marginTop: 16 }}>
          Signals updated {s ? formatUtc(s.generatedAt) : "–"}.{" "}
          <Link href="/verify">
            How the reads are verified <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </p>
      </section>
    </div>
  );
}
