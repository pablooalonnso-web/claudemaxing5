"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { StockLogo } from "@/components/StockLogo";
import { useVaultView } from "@/components/data/useVaultView";
import { useWallet } from "@/components/wallet/WalletProvider";
import { explorerAddress } from "@/lib/chain";
import { formatCurrency, formatPercent, formatPrice, formatUsd, usdgToNumber } from "@/lib/format";
import { depositStatusOf, type ManagedLiveState } from "@/lib/managed-vault";
import type { VaultPin } from "@/lib/registry";
import { isStale } from "@/lib/snapshots-client";
import { primaryPosition, rangeDistances, rangePosition } from "@/lib/vault-math";
import { ManagedVaultActions } from "./ManagedVaultActions";
import { MetricLabel } from "./MetricLabel";
import { RangeChart, type PricePoint } from "./RangeChart";

const noop = () => () => {};
const money = (v: number | null) => (v !== null && Number.isFinite(v) ? v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 6 : 2 }) : "–");
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Freshness({ observedAt, priceAsOf, delayed, valuationDelayed }: { observedAt?: string; priceAsOf?: string | null; delayed: boolean; valuationDelayed: boolean }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const fmt = (iso: string, full = false) =>
    new Date(iso).toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(full ? { month: "short", day: "numeric", year: "numeric" } : {}),
      ...(!client ? { timeZone: "UTC", timeZoneName: "short" } : {}),
    });
  const has = !!observedAt && Number.isFinite(Date.parse(observedAt));
  const label = valuationDelayed ? "Valuation delayed" : delayed ? "Update delayed" : has ? "Updated" : "Loading…";
  return (
    <details className={`vault-freshness${delayed || valuationDelayed ? " vault-freshness-delayed" : ""}`}>
      <summary>
        <i aria-hidden="true" />
        {label}
        {has ? (
          <>
            {" "}
            <time dateTime={observedAt}>{fmt(observedAt!)}</time>
          </>
        ) : null}
      </summary>
      <div className="vault-freshness-details">
        {has ? (
          <p>
            Holdings and fees: <time dateTime={observedAt}>{fmt(observedAt!, true)}</time>.
          </p>
        ) : null}
        {priceAsOf && Number.isFinite(Date.parse(priceAsOf)) ? (
          <p>
            Market price: <time dateTime={priceAsOf}>{fmt(priceAsOf, true)}</time>.
          </p>
        ) : null}
        <p>{delayed ? "Showing saved values while checking for updates." : "Refreshes automatically."}</p>
      </div>
    </details>
  );
}

export function ManagedVaultWorkspace({ pin }: { pin: VaultPin }) {
  const entry = pin.preview;
  const { address: owner } = useWallet();
  const view = useVaultView(pin, owner);
  const [live, setLive] = useState<ManagedLiveState | null>(null);
  const onState = useCallback((s: ManagedLiveState | null) => setLive(s), []);
  const snapshot = view.snapshot;
  const holdings = view.holdings;
  const position = primaryPosition(holdings?.positions);
  const distances = position ? rangeDistances(position.lower, position.upper, position.current) : null;
  const symbol = pin.symbol;
  const stockToken = entry.asset.toLowerCase() === entry.token0.toLowerCase() ? entry.token1 : entry.token0;
  const managedState = live ?? snapshot?.extras?.managedState ?? null;
  const deposit = depositStatusOf(managedState);
  const unclaimed = position?.unclaimedFees ?? null;
  const lifetime = snapshot?.fees ?? null;
  const totalFees = lifetime !== null && unclaimed !== null ? (BigInt(lifetime) + BigInt(unclaimed)).toString() : null;
  const points = useMemo<PricePoint[]>(() => {
    const list = (snapshot?.priceHistory ?? []).filter((p) => Number.isFinite(p.dexPriceUsd) && p.dexPriceUsd > 0).map((p) => ({ date: p.date, price: p.dexPriceUsd }));
    const current = position?.current;
    if (holdings && current != null) list.push({ date: holdings.observedAt, price: current });
    return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [snapshot?.priceHistory, holdings, position]);
  const totalAssets = live && live.value !== null ? live.value.toString() : snapshot?.assets ?? null;
  const totalSupply = live ? live.supply.toString() : snapshot?.extras?.totalSupply ?? null;
  const sharePrice = totalAssets && totalSupply && BigInt(totalSupply) > 0n ? Number(totalAssets) / 1e6 / (Number(totalSupply) / 1e18) : null;
  const delayed = !!view.row && isStale(view.row);
  const valuationDelayed = !!live && live.value === null;
  const apr = view.apr;

  return (
    <main className="single-vault-workspace managed-vault-workspace masthead-page">
      <section className="masthead masthead-1120 masthead-bleed">
        <div className="masthead-inner">
          <nav className="masthead-crumb sv-breadcrumb" aria-label="Breadcrumb">
            <Link href="/vaults">Vaults</Link>
            <span aria-hidden="true">/</span>
            <span>{symbol} vault</span>
          </nav>
          <header className="masthead-head single-vault-header sv-header">
            <div className="masthead-identity">
              <StockLogo symbol={symbol} size={52} />
              <div>
                <h1>
                  {symbol} vault <span className="mono">{symbol} / USDG</span>
                </h1>
                <div className="masthead-tags">
                  <span
                    className={`vault-table-tag vault-table-tag-${deposit.tone}`}
                    title={managedState ? "Last observed vault status. Availability is checked again before wallet approval." : "Availability will be checked before wallet approval."}
                    role="status"
                  >
                    {deposit.label}
                  </span>
                  <span className="dtag">Vault shares</span>
                  <a className="dtag" href={explorerAddress(entry.vault)} target="_blank" rel="noreferrer">
                    Vault <code>{entry.vault.slice(0, 6)}…{entry.vault.slice(-4)}</code> ↗
                  </a>
                </div>
              </div>
            </div>
          </header>
          <div className="mast-stats sv-stats single-vault-metrics sv-stats-fees">
            <div>
              <MetricLabel label="Total value locked">USDG in this vault</MetricLabel>
              <strong>{formatUsd(usdgToNumber(totalAssets))}</strong>
            </div>
            <div className="sv-apr single-vault-apr">
              <MetricLabel label="Est. fee APR · 24h">{apr === null ? "Awaiting sufficient current data" : "At current invested allocation"}</MetricLabel>
              <strong>{formatPercent(apr)}</strong>
            </div>
            <div>
              <MetricLabel label="Your fee earnings">{owner ? "Fees attributable to your shares are computed from vault history and appear once the earnings indexer has observed your position." : "Connect your wallet to view earnings"}</MetricLabel>
              <strong>–</strong>
            </div>
            <div>
              <MetricLabel label="Unclaimed fees">Accrued in the LP · before vault fees</MetricLabel>
              <strong>{formatCurrency(usdgToNumber(unclaimed))}</strong>
            </div>
            <div>
              <MetricLabel label="Total fees earned">Collected + unclaimed · before vault fees</MetricLabel>
              <strong>{formatCurrency(usdgToNumber(totalFees))}</strong>
            </div>
          </div>
        </div>
      </section>
      <div className="single-vault-body">
        <section className="single-vault-liquidity" aria-label="Vault liquidity positions">
          <div className="sv-card">
            <div className="sv-card-head">
              <div>
                <h2>Price and LP range</h2>
                <p>{symbol} / USDG</p>
              </div>
              <Freshness observedAt={holdings?.observedAt} priceAsOf={snapshot?.extras?.displayPriceAsOf} delayed={delayed} valuationDelayed={valuationDelayed} />
            </div>
            <RangeChart points={points} lower={position?.status === "active" ? position.lower : null} upper={position?.status === "active" ? position.upper : null} current={position?.current ?? null} symbol={symbol} unavailable={!holdings} />
            <div className="sv-bounds">
              <div>
                <span>Lower bound</span>
                <strong>{money(position?.lower ?? null)}</strong>
                <small>{distances ? `${signed(distances.toLower)} from price` : "–"}</small>
              </div>
              <div>
                <span>Current pool price</span>
                <strong>{money(position?.current ?? null)}</strong>
                <small>
                  {position
                    ? position.status === "active"
                      ? position.inRange === null
                        ? "Price unavailable"
                        : position.inRange
                          ? "Inside the range"
                          : "Outside the range"
                      : "Range not yet active"
                    : holdings
                      ? "No position"
                      : "Range data unavailable"}
                </small>
              </div>
              <div>
                <span>Upper bound</span>
                <strong>{money(position?.upper ?? null)}</strong>
                <small>{distances ? `${signed(distances.toUpper)} from price` : "–"}</small>
              </div>
              <div>
                <span>Range width</span>
                <strong>{distances ? `${distances.width.toLocaleString("en-US", { maximumFractionDigits: 1 })}%` : "–"}</strong>
                <small>Upper over lower</small>
              </div>
            </div>
          </div>
          {holdings ? (
            holdings.positions.length === 0 ? (
              <div className="single-vault-empty">
                <h3>Waiting for the first position</h3>
                <p>Configured pools appear here automatically.</p>
              </div>
            ) : (
              holdings.positions.map((p) => {
                const pct = rangePosition(p.lower, p.upper, p.current);
                const active = p.status === "active";
                const label = p.status === "recovery" ? "Recovery in progress" : p.status === "unavailable" ? "Temporarily unavailable" : active ? (p.inRange === null ? "Price unavailable" : p.inRange ? "In range" : "Out of range") : "Awaiting allocation";
                const isV4 = !!entry.v4;
                const v4 = entry.v4 as { poolId?: string } | undefined;
                return (
                  <article className="single-vault-lp" key={p.id}>
                    <header>
                      <div>
                        <h3>{symbol} / USDG</h3>
                        <p>Uniswap {isV4 ? "V4" : "V3"}</p>
                      </div>
                      <span className={`single-vault-range-status ${active && p.inRange ? "in-range" : ""}`}>{label}</span>
                    </header>
                    <div className="single-vault-lp-value">
                      <span>Position value</span>
                      <strong>{formatUsd(usdgToNumber(p.assets))}</strong>
                    </div>
                    <div className="single-vault-range" role="img" aria-label={`${active ? "LP" : "Configured"} range: ${money(p.lower)} to ${money(p.upper)}. Current pool price ${money(p.current)}.`}>
                      <div className="single-vault-range-track">{pct !== null ? <i style={{ left: `${pct}%` }} /> : null}</div>
                    </div>
                    <dl className="single-vault-price-grid">
                      <div>
                        <dt>Lower price</dt>
                        <dd>{money(p.lower)}</dd>
                      </div>
                      <div>
                        <dt>Current pool price</dt>
                        <dd>{money(p.current)}</dd>
                      </div>
                      <div>
                        <dt>Upper price</dt>
                        <dd>{money(p.upper)}</dd>
                      </div>
                    </dl>
                    {!active ? (
                      <p className="single-vault-caption">{p.status === "waiting" ? "Configured range shown. Your first deposit opens the LP when market checks permit." : "The displayed range does not indicate an earning LP position."}</p>
                    ) : null}
                    {isV4 && v4?.poolId ? (
                      <p className="single-vault-caption">
                        V4 pool ID: <code style={{ overflowWrap: "anywhere" }}>{v4.poolId}</code>
                      </p>
                    ) : null}
                    <footer>
                      <span>Target allocation {p.targetWeightBps === null ? "–" : `${p.targetWeightBps / 100}%`}</span>
                      <a href={explorerAddress(entry.pool)} target="_blank" rel="noreferrer">
                        {isV4 ? "View LP venue ↗" : "View pool ↗"}
                      </a>
                    </footer>
                  </article>
                );
              })
            )
          ) : (
            <div className="single-vault-empty">Refreshing live positions. Values appear when the connection is available.</div>
          )}
          <div className="sv-two">
            <div className="sv-card sv-vault-details">
              <div className="sv-card-head">
                <div>
                  <h2>Vault details</h2>
                  <p>Cash and share information</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Available cash · USDG</dt>
                  <dd>{holdings?.idleAssets != null ? (Number(holdings.idleAssets) / 1e6).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "–"}</dd>
                </div>
                <div>
                  <dt>Share price</dt>
                  <dd>{formatPrice(sharePrice)}</dd>
                </div>
              </dl>
              <p className="single-vault-caption">Cash is held outside the LP. Share price is the USDG value of one whole vault share.</p>
            </div>
            <div className="sv-card">
              <div className="sv-card-head">
                <div>
                  <h2>Contracts</h2>
                  <p>Verified against the reviewed deployment before every action</p>
                </div>
              </div>
              <div className="sv-contracts">
                {[
                  ["Vault", entry.vault],
                  ["Stock Token", stockToken],
                  ["Entry router", entry.router],
                  ["LP position", entry.position],
                ].map(([label, address]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <a href={explorerAddress(address)} target="_blank" rel="noreferrer">
                      <code>{short(address)}</code> ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <details className="single-vault-methodology">
            <summary>About this strategy &amp; APR</summary>
            <p>
              Deposit USDG for a share of managed {symbol}/USDG liquidity. Withdraw your share as pool tokens, or receive USDG when a protected swap
              quote is available. Deposits and withdrawals execute in your wallet transaction.
            </p>
            <p>
              The fee APR annualizes recorded trading fees over the available portion of the last 24 hours, divides it by observed capital over
              time, and deducts protocol fees. It excludes token price gains and swap or rebalance costs. Short observation windows can produce
              volatile annualized estimates. No return is guaranteed.
            </p>
            <p>Recovery payments, when applicable, are claimed separately by eligible holders.</p>
          </details>
        </section>
        <div className="single-vault-deposit-panel">
          <ManagedVaultActions pin={pin} onState={onState} />
        </div>
      </div>
    </main>
  );
}
