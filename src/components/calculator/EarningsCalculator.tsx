"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import type { VaultPin } from "@/lib/registry";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { formatPercent } from "@/lib/format";
import styles from "@/styles/calculator.module.css";

/** Share of claimed fees that stays with vault participants (the rest funds the buyback and the treasury). */
const HOLDER_SHARE = 0.7;
const usd = (n: number, digits = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

type Row = { pin: VaultPin; apr: number | null; tvl: number | null; fees: number | null; observed: number | null; asOf: string | null; open: boolean };

function windowLabel(t: TFunction, seconds: number | null) {
  if (seconds === null) return t("window.none");
  if (seconds < 3600) return t("window.min", { n: Math.max(1, Math.round(seconds / 60)) });
  if (seconds < 24 * 3600) return t("window.hours", { n: (seconds / 3600).toFixed(1) });
  return t("window.days", { n: (seconds / 86400).toFixed(1) });
}

export function EarningsCalculator() {
  const t = useT("calculator");
  const { rows: raw, singles, error } = useProtocolVaults();
  const [amountText, setAmountText] = useState("1000");
  const [selected, setSelected] = useState<string>("");

  const rows = useMemo<Row[]>(() => {
    if (!raw) return [];
    return singles.map((pin) => {
      const r = raw.find((x) => x.descriptor.vault.toLowerCase() === pin.vault.toLowerCase());
      const s = r?.snapshot;
      const m = s?.extras?.managedState;
      let fees: number | null = s?.fees ? Number(s.fees) / 1e6 : null;
      const positions = s?.holdings?.positions;
      if (fees !== null && positions) for (const p of positions) fees += p.unclaimedFees ? Number(p.unclaimedFees) / 1e6 : 0;
      return {
        pin,
        apr: s?.extras?.feeApr?.source === "vault-fees-v1" && typeof s.apr === "number" ? s.apr : null,
        tvl: s?.assets ? Number(s.assets) / 1e6 : null,
        fees,
        observed: s?.extras?.feeApr?.observedSeconds ?? null,
        asOf: s?.extras?.feeApr?.asOf ?? null,
        open: !!m && m.open && !m.stopped && !m.recovery,
      };
    });
  }, [raw, singles]);

  const amount = /^\d{1,9}(\.\d{1,2})?$/.test(amountText) ? Number(amountText) : NaN;
  const valid = Number.isFinite(amount) && amount > 0;
  const ranked = [...rows].sort((a, b) => (b.apr ?? -1) - (a.apr ?? -1));
  const current = rows.find((r) => r.pin.vault === selected) ?? ranked[0] ?? null;

  const perDay = current && current.apr !== null && valid ? (amount * current.apr) / 365 : null;
  const lifetimeShare = current && current.fees !== null && current.tvl && valid ? (amount / (current.tvl + amount)) * current.fees * HOLDER_SHARE : null;

  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-labelledby="calc-heading">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t("calc.eyebrow")}</p>
            <h2 id="calc-heading">{t("calc.title")}</h2>
          </div>
          <p>{t("calc.sub")}</p>
        </div>
        <div className={styles.controls}>
          <label className="amount-box amount-box-input" htmlFor="calc-amount">
            <div className="amount-box-top">
              <span>{t("amount.label")}</span>
              <span>{t("amount.hint")}</span>
            </div>
            <div className="wallet-amount-main">
              <input id="calc-amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="1000" />
              <span>USDG</span>
            </div>
          </label>
          <label className={styles.select}>
            <span>{t("vault.label")}</span>
            <select value={current?.pin.vault ?? ""} onChange={(e) => setSelected(e.target.value)}>
              {ranked.map((r) => (
                <option key={r.pin.vault} value={r.pin.vault}>
                  {r.pin.symbol} · {r.apr === null ? t("option.noApr") : t("option.feeApr", { apr: formatPercent(r.apr) })}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.result} aria-live="polite">
          <div className={styles.stat}>
            <span>{t("perDay")}</span>
            <strong>{perDay === null ? "–" : usd(perDay)}</strong>
            <small>{t("perDay.note")}</small>
          </div>
          <div className={styles.stat}>
            <span>{t("perWeek")}</span>
            <strong>{perDay === null ? "–" : usd(perDay * 7)}</strong>
            <small>{t("perWeek.note")}</small>
          </div>
          <div className={styles.stat}>
            <span>{t("perMonth")}</span>
            <strong>{perDay === null ? "–" : usd(perDay * 30)}</strong>
            <small>{t("perMonth.note")}</small>
          </div>
        </div>
        {current ? (
          <p className={styles.window}>
            {current.apr === null
              ? t("window.noWindow", { symbol: current.pin.symbol })
              : t("window.summary", {
                  symbol: current.pin.symbol,
                  apr: formatPercent(current.apr),
                  window: windowLabel(t, current.observed),
                  assets: current.tvl ? usd(current.tvl, 0) : t("window.its"),
                  stale: error ? t("window.stale") : "",
                })}
          </p>
        ) : null}
        {current && lifetimeShare !== null && current.fees !== null ? (
          <div className={styles.lifetime}>
            <p>
              {t("lifetime.before")}
              <b>{usd(current.fees)}</b>
              {t("lifetime.after", { amount: usd(amount, 0) })}
            </p>
            <strong>{usd(lifetimeShare)}</strong>
          </div>
        ) : null}
        <div className={styles.cta}>
          {current ? (
            <Link className="hex hex-green" href={current.pin.href}>
              {t("cta.open", { symbol: current.pin.symbol })} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : null}
          <Link className="hex hex-outline" href="/strategies/basket">
            {t("cta.basket")}
          </Link>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="calc-table-heading">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">{t("table.eyebrow")}</p>
            <h2 id="calc-table-heading">{t("table.title", { amount: valid ? usd(amount, 0) : t("table.amountFallback") })}</h2>
          </div>
          <p>{t("table.sub")}</p>
        </div>
        <div className={styles.table} role="table">
          <div className={`${styles.row} ${styles.hd}`} role="row">
            <span />
            <span>{t("table.vault")}</span>
            <span className={styles.num}>{t("table.feeApr")}</span>
            <span className={`${styles.num} ${styles.hideM}`}>{t("table.assets")}</span>
            <span className={`${styles.num} ${styles.hideM}`}>{t("table.window")}</span>
            <span className={styles.num}>{t("table.perDay")}</span>
          </div>
          {ranked.map((r) => {
            const d = r.apr !== null && valid ? (amount * r.apr) / 365 : null;
            return (
              <div key={r.pin.vault} className={`${styles.row}${current?.pin.vault === r.pin.vault ? ` ${styles.sel}` : ""}`} role="row">
                <StockLogo symbol={r.pin.symbol} size={30} />
                <span>
                  <button type="button" onClick={() => setSelected(r.pin.vault)}>
                    {r.pin.symbol}
                  </button>
                  <span className={styles.muted}>{r.open ? "" : t("table.paused")}</span>
                </span>
                <span className={styles.num}>{r.apr === null ? "–" : formatPercent(r.apr)}</span>
                <span className={`${styles.num} ${styles.hideM}`}>{r.tvl === null ? "–" : usd(r.tvl, 0)}</span>
                <span className={`${styles.num} ${styles.hideM} ${styles.muted}`}>{windowLabel(t, r.observed)}</span>
                <b className={styles.num}>{d === null ? "–" : usd(d)}</b>
              </div>
            );
          })}
          {!raw ? <div className={styles.row}>{t("table.loading")}</div> : null}
        </div>
      </section>

      <section className={styles.notes} aria-label={t("notes.aria")}>
        <div>
          <h3>{t("notes.rate.title")}</h3>
          <p>{t("notes.rate.body")}</p>
        </div>
        <div>
          <h3>{t("notes.leaves.title")}</h3>
          <p>{t("notes.leaves.body")}</p>
        </div>
        <div>
          <h3>{t("notes.check.title")}</h3>
          <p>
            {t("notes.check.before")}
            <Link href="/verify">{t("notes.check.link")}</Link>
            {t("notes.check.after")}
          </p>
        </div>
      </section>
    </div>
  );
}
