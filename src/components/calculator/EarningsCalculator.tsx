"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { StockLogo } from "@/components/StockLogo";
import type { VaultPin } from "@/lib/registry";
import { formatPercent } from "@/lib/format";
import styles from "@/styles/calculator.module.css";

/** Share of claimed fees that stays with vault participants (the rest funds the buyback and the treasury). */
const HOLDER_SHARE = 0.7;
const usd = (n: number, digits = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

type Row = { pin: VaultPin; apr: number | null; tvl: number | null; fees: number | null; observed: number | null; asOf: string | null; open: boolean };

function windowLabel(seconds: number | null) {
  if (seconds === null) return "no window yet";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 24 * 3600) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

export function EarningsCalculator() {
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
            <p className="eyebrow">Fee calculator</p>
            <h2 id="calc-heading">What would this amount have earned?</h2>
          </div>
          <p>Past pool fees, read from the chain. Not a forecast.</p>
        </div>
        <div className={styles.controls}>
          <label className="amount-box amount-box-input" htmlFor="calc-amount">
            <div className="amount-box-top">
              <span>Amount</span>
              <span>USDG deposited</span>
            </div>
            <div className="wallet-amount-main">
              <input id="calc-amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="1000" />
              <span>USDG</span>
            </div>
          </label>
          <label className={styles.select}>
            <span>Vault</span>
            <select value={current?.pin.vault ?? ""} onChange={(e) => setSelected(e.target.value)}>
              {ranked.map((r) => (
                <option key={r.pin.vault} value={r.pin.vault}>
                  {r.pin.symbol} · {r.apr === null ? "no APR yet" : `${formatPercent(r.apr)} fee APR`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.result} aria-live="polite">
          <div className={styles.stat}>
            <span>Per day</span>
            <strong>{perDay === null ? "–" : usd(perDay)}</strong>
            <small>Fees your share would have collected in one day at the observed rate, after the 70 / 20 / 10 split.</small>
          </div>
          <div className={styles.stat}>
            <span>Per week</span>
            <strong>{perDay === null ? "–" : usd(perDay * 7)}</strong>
            <small>Same rate held for seven days. Rates move with volume and range.</small>
          </div>
          <div className={styles.stat}>
            <span>Per month</span>
            <strong>{perDay === null ? "–" : usd(perDay * 30)}</strong>
            <small>Thirty days at the same rate. A month of real fees will differ.</small>
          </div>
        </div>
        {current ? (
          <p className={styles.window}>
            {current.apr === null
              ? `${current.pin.symbol} has no fee window yet; the rate appears once the vault has been observed long enough.`
              : `${current.pin.symbol} vault: ${formatPercent(current.apr)} fee APR observed over the last ${windowLabel(current.observed)} on ${current.tvl ? usd(current.tvl, 0) : "its"} of assets${error ? " (feed currently stale)" : ""}. Vault shares also move with the ${current.pin.symbol} price; fees are only part of the outcome.`}
          </p>
        ) : null}
        {current && lifetimeShare !== null && current.fees !== null ? (
          <div className={styles.lifetime}>
            <p>
              Since launch this vault has earned <b>{usd(current.fees)}</b> in gross trading fees. Had {usd(amount, 0)} sat in it the whole time at today&apos;s size, its 70% share of those fees would have been about
            </p>
            <strong>{usd(lifetimeShare)}</strong>
          </div>
        ) : null}
        <div className={styles.cta}>
          {current ? (
            <Link className="hex hex-green" href={current.pin.href}>
              Open the {current.pin.symbol} vault <ArrowRight size={14} aria-hidden="true" />
            </Link>
          ) : null}
          <Link className="hex hex-outline" href="/strategies/basket">
            Spread it across the top vaults
          </Link>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="calc-table-heading">
        <div className={styles.head}>
          <div>
            <p className="eyebrow">All 18 vaults</p>
            <h2 id="calc-table-heading">{valid ? usd(amount, 0) : "The amount"} in each vault, at the observed rate.</h2>
          </div>
          <p>Ranked by fee APR. Refreshed every 15 seconds.</p>
        </div>
        <div className={styles.table} role="table">
          <div className={`${styles.row} ${styles.hd}`} role="row">
            <span />
            <span>Vault</span>
            <span className={styles.num}>Fee APR</span>
            <span className={`${styles.num} ${styles.hideM}`}>Assets</span>
            <span className={`${styles.num} ${styles.hideM}`}>Window</span>
            <span className={styles.num}>Per day</span>
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
                  <span className={styles.muted}>{r.open ? "" : " · deposits paused"}</span>
                </span>
                <span className={styles.num}>{r.apr === null ? "–" : formatPercent(r.apr)}</span>
                <span className={`${styles.num} ${styles.hideM}`}>{r.tvl === null ? "–" : usd(r.tvl, 0)}</span>
                <span className={`${styles.num} ${styles.hideM} ${styles.muted}`}>{windowLabel(r.observed)}</span>
                <b className={styles.num}>{d === null ? "–" : usd(d)}</b>
              </div>
            );
          })}
          {!raw ? <div className={styles.row}>Reading the vaults…</div> : null}
        </div>
      </section>

      <section className={styles.notes} aria-label="How to read these numbers">
        <div>
          <h3>Where the rate comes from</h3>
          <p>The site samples each vault&apos;s fee counters and assets every 15 seconds and annualises the fees earned over the observed window. The window resets when the site restarts, so a short window is a rough rate.</p>
        </div>
        <div>
          <h3>What it leaves out</h3>
          <p>The Stock Token price. Vault shares track a concentrated liquidity position and can lose value when the stock moves. Fees are one part of the result, and past fees do not predict the next day&apos;s.</p>
        </div>
        <div>
          <h3>Check it yourself</h3>
          <p>Every input is on the chain: grossFees and totalSupply on the vault, assets from its position. The <Link href="/verify">verification page</Link> reads the same counters and publishes the script.</p>
        </div>
      </section>
    </div>
  );
}
