"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { StockLogo } from "@/components/StockLogo";
import { useVaultView } from "@/components/data/useVaultView";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useT } from "@/i18n/client";
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

/** Stable key for the label `depositStatusOf` (src/lib/managed-vault.ts) returns, mirroring its branch order. */
export function managedStatusKey(state: Parameters<typeof depositStatusOf>[0]): "checking" | "recovery" | "stopped" | "restart" | "open" | "closed" {
  if (!state) return "checking";
  if (state.recovery) return "recovery";
  if (state.stopped) return "stopped";
  if (state.restart) return "restart";
  return state.open ? "open" : "closed";
}

function Freshness({ observedAt, priceAsOf, delayed, valuationDelayed }: { observedAt?: string; priceAsOf?: string | null; delayed: boolean; valuationDelayed: boolean }) {
  const t = useT("vaults");
  const client = useSyncExternalStore(noop, () => true, () => false);
  const fmt = (iso: string, full = false) =>
    new Date(iso).toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(full ? { month: "short", day: "numeric", year: "numeric" } : {}),
      ...(!client ? { timeZone: "UTC", timeZoneName: "short" } : {}),
    });
  const has = !!observedAt && Number.isFinite(Date.parse(observedAt));
  const label = valuationDelayed ? t("fresh.valuationDelayed") : delayed ? t("fresh.updateDelayed") : has ? t("fresh.updated") : t("fresh.loading");
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
            {t("fresh.holdings.before")}
            <time dateTime={observedAt}>{fmt(observedAt!, true)}</time>
            {t("fresh.holdings.after")}
          </p>
        ) : null}
        {priceAsOf && Number.isFinite(Date.parse(priceAsOf)) ? (
          <p>
            {t("fresh.price.before")}
            <time dateTime={priceAsOf}>{fmt(priceAsOf, true)}</time>
            {t("fresh.price.after")}
          </p>
        ) : null}
        <p>{delayed ? t("fresh.saved") : t("fresh.auto")}</p>
      </div>
    </details>
  );
}

export function ManagedVaultWorkspace({ pin }: { pin: VaultPin }) {
  const t = useT("vaults");
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
  const depositLabel = t(`managed.${managedStatusKey(managedState)}`);
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
  const vaultName = t("detail.vaultName", { symbol });

  return (
    <main className="single-vault-workspace managed-vault-workspace masthead-page">
      <section className="masthead masthead-1120 masthead-bleed">
        <div className="masthead-inner">
          <nav className="masthead-crumb sv-breadcrumb" aria-label={t("detail.breadcrumbAria")}>
            <Link href="/vaults">{t("detail.vaults")}</Link>
            <span aria-hidden="true">/</span>
            <span>{vaultName}</span>
          </nav>
          <header className="masthead-head single-vault-header sv-header">
            <div className="masthead-identity">
              <StockLogo symbol={symbol} size={52} />
              <div>
                <h1>
                  {vaultName} <span className="mono">{symbol} / USDG</span>
                </h1>
                <div className="masthead-tags">
                  <span className={`vault-table-tag vault-table-tag-${deposit.tone}`} title={managedState ? t("detail.statusTitleObserved") : t("detail.statusTitlePending")} role="status">
                    {depositLabel}
                  </span>
                  <span className="dtag">{t("detail.sharesTag")}</span>
                  <a className="dtag" href={explorerAddress(entry.vault)} target="_blank" rel="noreferrer">
                    {t("detail.vaultLink")}{" "}
                    <code>
                      {entry.vault.slice(0, 6)}…{entry.vault.slice(-4)}
                    </code>{" "}
                    ↗
                  </a>
                </div>
              </div>
            </div>
          </header>
          <div className="mast-stats sv-stats single-vault-metrics sv-stats-fees">
            <div>
              <MetricLabel label={t("metric.tvl")}>{t("metric.tvlTip")}</MetricLabel>
              <strong>{formatUsd(usdgToNumber(totalAssets))}</strong>
            </div>
            <div className="sv-apr single-vault-apr">
              <MetricLabel label={t("metric.apr")}>{apr === null ? t("metric.aprAwaiting") : t("metric.aprCurrent")}</MetricLabel>
              <strong>{formatPercent(apr)}</strong>
            </div>
            <div>
              <MetricLabel label={t("metric.earnings")}>{owner ? t("metric.earningsTip") : t("metric.earningsConnect")}</MetricLabel>
              <strong>–</strong>
            </div>
            <div>
              <MetricLabel label={t("metric.unclaimed")}>{t("metric.unclaimedTip")}</MetricLabel>
              <strong>{formatCurrency(usdgToNumber(unclaimed))}</strong>
            </div>
            <div>
              <MetricLabel label={t("metric.totalFees")}>{t("metric.totalFeesTip")}</MetricLabel>
              <strong>{formatCurrency(usdgToNumber(totalFees))}</strong>
            </div>
          </div>
        </div>
      </section>
      <div className="single-vault-body">
        <section className="single-vault-liquidity" aria-label={t("liquidity.aria")}>
          <div className="sv-card">
            <div className="sv-card-head">
              <div>
                <h2>{t("liquidity.title")}</h2>
                <p>{symbol} / USDG</p>
              </div>
              <Freshness observedAt={holdings?.observedAt} priceAsOf={snapshot?.extras?.displayPriceAsOf} delayed={delayed} valuationDelayed={valuationDelayed} />
            </div>
            <RangeChart points={points} lower={position?.status === "active" ? position.lower : null} upper={position?.status === "active" ? position.upper : null} current={position?.current ?? null} symbol={symbol} unavailable={!holdings} />
            <div className="sv-bounds">
              <div>
                <span>{t("bounds.lower")}</span>
                <strong>{money(position?.lower ?? null)}</strong>
                <small>{distances ? t("bounds.fromPrice", { delta: signed(distances.toLower) }) : "–"}</small>
              </div>
              <div>
                <span>{t("bounds.current")}</span>
                <strong>{money(position?.current ?? null)}</strong>
                <small>
                  {position
                    ? position.status === "active"
                      ? position.inRange === null
                        ? t("bounds.priceUnavailable")
                        : position.inRange
                          ? t("bounds.inside")
                          : t("bounds.outside")
                      : t("bounds.notActive")
                    : holdings
                      ? t("bounds.noPosition")
                      : t("bounds.unavailable")}
                </small>
              </div>
              <div>
                <span>{t("bounds.upper")}</span>
                <strong>{money(position?.upper ?? null)}</strong>
                <small>{distances ? t("bounds.fromPrice", { delta: signed(distances.toUpper) }) : "–"}</small>
              </div>
              <div>
                <span>{t("bounds.width")}</span>
                <strong>{distances ? `${distances.width.toLocaleString("en-US", { maximumFractionDigits: 1 })}%` : "–"}</strong>
                <small>{t("bounds.widthNote")}</small>
              </div>
            </div>
          </div>
          {holdings ? (
            holdings.positions.length === 0 ? (
              <div className="single-vault-empty">
                <h3>{t("lp.waitingTitle")}</h3>
                <p>{t("lp.waitingBody")}</p>
              </div>
            ) : (
              holdings.positions.map((p) => {
                const pct = rangePosition(p.lower, p.upper, p.current);
                const active = p.status === "active";
                const label = p.status === "recovery" ? t("lp.recovery") : p.status === "unavailable" ? t("lp.unavailable") : active ? (p.inRange === null ? t("lp.priceUnavailable") : p.inRange ? t("lp.inRange") : t("lp.outOfRange")) : t("lp.awaiting");
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
                      <span>{t("lp.value")}</span>
                      <strong>{formatUsd(usdgToNumber(p.assets))}</strong>
                    </div>
                    <div className="single-vault-range" role="img" aria-label={t("lp.rangeAria", { kind: active ? t("lp.rangeKindLp") : t("lp.rangeKindConfigured"), lower: money(p.lower), upper: money(p.upper), current: money(p.current) })}>
                      <div className="single-vault-range-track">{pct !== null ? <i style={{ left: `${pct}%` }} /> : null}</div>
                    </div>
                    <dl className="single-vault-price-grid">
                      <div>
                        <dt>{t("lp.lowerPrice")}</dt>
                        <dd>{money(p.lower)}</dd>
                      </div>
                      <div>
                        <dt>{t("lp.currentPrice")}</dt>
                        <dd>{money(p.current)}</dd>
                      </div>
                      <div>
                        <dt>{t("lp.upperPrice")}</dt>
                        <dd>{money(p.upper)}</dd>
                      </div>
                    </dl>
                    {!active ? <p className="single-vault-caption">{p.status === "waiting" ? t("lp.captionWaiting") : t("lp.captionInactive")}</p> : null}
                    {isV4 && v4?.poolId ? (
                      <p className="single-vault-caption">
                        {t("lp.poolId")} <code style={{ overflowWrap: "anywhere" }}>{v4.poolId}</code>
                      </p>
                    ) : null}
                    <footer>
                      <span>{t("lp.target", { value: p.targetWeightBps === null ? "–" : `${p.targetWeightBps / 100}%` })}</span>
                      <a href={explorerAddress(entry.pool)} target="_blank" rel="noreferrer">
                        {isV4 ? t("lp.viewVenue") : t("lp.viewPool")}
                      </a>
                    </footer>
                  </article>
                );
              })
            )
          ) : (
            <div className="single-vault-empty">{t("lp.refreshing")}</div>
          )}
          <div className="sv-two">
            <div className="sv-card sv-vault-details">
              <div className="sv-card-head">
                <div>
                  <h2>{t("details.title")}</h2>
                  <p>{t("details.subtitle")}</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>{t("details.cash")}</dt>
                  <dd>{holdings?.idleAssets != null ? (Number(holdings.idleAssets) / 1e6).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "–"}</dd>
                </div>
                <div>
                  <dt>{t("details.sharePrice")}</dt>
                  <dd>{formatPrice(sharePrice)}</dd>
                </div>
              </dl>
              <p className="single-vault-caption">{t("details.caption")}</p>
            </div>
            <div className="sv-card">
              <div className="sv-card-head">
                <div>
                  <h2>{t("contracts.title")}</h2>
                  <p>{t("contracts.subtitle")}</p>
                </div>
              </div>
              <div className="sv-contracts">
                {[
                  ["vault", entry.vault],
                  ["stockToken", stockToken],
                  ["router", entry.router],
                  ["position", entry.position],
                ].map(([key, address]) => (
                  <div key={key}>
                    <span>{t(`contracts.${key}`)}</span>
                    <a href={explorerAddress(address)} target="_blank" rel="noreferrer">
                      <code>{short(address)}</code> ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <details className="single-vault-methodology">
            <summary>{t("method.summary")}</summary>
            <p>{t("method.p1", { symbol })}</p>
            <p>{t("method.p2")}</p>
            <p>{t("method.p3")}</p>
          </details>
        </section>
        <div className="single-vault-deposit-panel">
          <ManagedVaultActions pin={pin} onState={onState} />
        </div>
      </div>
    </main>
  );
}
