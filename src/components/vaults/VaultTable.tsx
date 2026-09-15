"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { PrefetchLink } from "@/components/PrefetchLink";
import { StockLogo, stockName } from "@/components/StockLogo";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { useVaultView } from "@/components/data/useVaultView";
import { useWallet } from "@/components/wallet/WalletProvider";
import { formatPercent, formatPrice, formatUsd, usdgToNumber } from "@/lib/format";
import type { VaultPin } from "@/lib/registry";
import { depositStatus, describeAprWindow, primaryPosition, rangePosition, rangeStatus, sumColumn } from "@/lib/vault-math";

type LiveInfo = { tvl: number | null; apr: number | null; open: boolean | null; position: number | null; depositKey: string; rangeKey: string };

function Row({
  pin,
  owner,
  snapshotTvl,
  onLive,
  hidden,
}: {
  pin: VaultPin;
  owner?: `0x${string}`;
  snapshotTvl: string | null;
  onLive: (id: string, info: LiveInfo) => void;
  hidden: boolean;
}) {
  const view = useVaultView(pin, owner);
  const holdings = view.holdings;
  const tvl = usdgToNumber(holdings?.totalAssets ?? snapshotTvl);
  const deposit = depositStatus(view.extras?.depositsEnabled, view.extras?.depositsPaused);
  const range = rangeStatus(holdings ? holdings.positions : null);
  const position = primaryPosition(holdings?.positions);
  const pct = position ? rangePosition(position.lower, position.upper, position.current) : null;
  const yours = owner ? (view.position?.assets != null ? Number(formatUnits(view.position.assets, 6)) : null) : null;
  const apr = view.apr;
  useEffect(() => {
    onLive(pin.id, { tvl, apr, open: deposit.key === "unknown" ? null : deposit.key === "open", position: yours, depositKey: deposit.key, rangeKey: range.key });
  }, [pin.id, tvl, apr, deposit.key, range.key, yours, onLive]);
  return (
    <tr hidden={hidden}>
      <td>
        <PrefetchLink href={pin.href} className="vault-table-identity">
          <StockLogo symbol={pin.symbol} size={30} />
          <span>
            <b>{stockName(pin.symbol)}</b>
            <small className="mono">{pin.symbol} / USDG</small>
          </span>
        </PrefetchLink>
      </td>
      <td>
        <span className={`vault-table-tag vault-table-tag-${deposit.key}`}>
          {deposit.key === "closed" ? "Closed" : deposit.key === "paused" ? "Paused" : deposit.label}
        </span>
      </td>
      <td data-label="TVL" className="mono vault-table-num">
        {formatUsd(tvl)}
      </td>
      <td data-label="Fee APR · 24h" className="mono vault-table-num vault-table-apr" title={describeAprWindow(view.aprInfo)}>
        {apr === null ? (
          <span className="vault-table-muted" title="Not enough current invested fee data">
            —
          </span>
        ) : (
          formatPercent(apr)
        )}
      </td>
      <td data-label="Price range (USDG)">
        {position && position.lower !== null && position.upper !== null ? (
          <span
            className="vault-table-range"
            role="img"
            aria-label={`Range ${formatPrice(position.lower)} to ${formatPrice(position.upper)}, current ${formatPrice(position.current)}`}
          >
            <small className="mono">{formatPrice(position.lower)}</small>
            <span className="vault-table-track">{pct !== null ? <i className={range.key === "out-of-range" ? "out" : ""} style={{ left: `${pct}%` }} /> : null}</span>
            <small className="mono">{formatPrice(position.upper)}</small>
          </span>
        ) : (
          <span className="vault-table-muted">{range.label}</span>
        )}
      </td>
      <td data-label="LP status">
        <span className={`vault-table-tag vault-table-tag-${range.key}`}>{range.label}</span>
      </td>
      <td data-label="Your position" className="mono vault-table-num">
        {owner ? (
          yours === null ? (
            <span className="vault-table-muted">
              {view.position && view.position.shares > 0n ? `${Number(formatUnits(view.position.shares, 18)).toLocaleString(undefined, { maximumSignificantDigits: 6 })} shares` : "Updating…"}
            </span>
          ) : yours === 0 ? (
            <span className="vault-table-muted">—</span>
          ) : (
            formatUsd(yours)
          )
        ) : (
          <span className="vault-table-muted" title="Connect your wallet to see your position">
            —
          </span>
        )}
      </td>
      <td className="vault-table-action">
        <PrefetchLink className={`btn btn-sm ${deposit.key === "open" ? "btn-primary" : "btn-ghost"}`} href={pin.href}>
          {deposit.key === "open" ? "Deposit" : "View"}
        </PrefetchLink>
      </td>
    </tr>
  );
}

export function VaultTable() {
  const { singles, snapshot, error } = useProtocolVaults();
  const { address: owner } = useWallet();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("any");
  const [range, setRange] = useState("any");
  const [sort, setSort] = useState<"tvl" | "apr" | "name">("tvl");
  const [live, setLive] = useState<Record<string, LiveInfo>>({});
  const onLive = useCallback((id: string, info: LiveInfo) => {
    setLive((prev) => {
      const p = prev[id];
      if (p && p.tvl === info.tvl && p.apr === info.apr && p.open === info.open && p.position === info.position && p.depositKey === info.depositKey && p.rangeKey === info.rangeKey) return prev;
      return { ...prev, [id]: info };
    });
  }, []);
  const rows = useMemo(() => snapshot?.rows.filter((r) => singles.some((s) => s.vault.toLowerCase() === r.vault.toLowerCase())) ?? null, [snapshot, singles]);
  const sorted = useMemo(() => {
    const list = singles.map((pin) => {
      const row = rows?.find((r) => r.vault.toLowerCase() === pin.vault.toLowerCase());
      const l = live[pin.id];
      return { id: pin.id, name: stockName(pin.symbol), symbol: pin.symbol, pin, snapshotTvl: row?.assets ?? null, tvl: l?.tvl ?? usdgToNumber(row?.assets ?? null), apr: l?.apr ?? null };
    });
    const dir = sort === "name" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "en");
      const av = a[sort];
      const bv = b[sort];
      if (av === null && bv === null) return a.name.localeCompare(b.name, "en");
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return a.name.localeCompare(b.name, "en");
      return dir * (av - bv);
    });
  }, [singles, rows, live, sort]);
  const q = query.trim().toLowerCase();
  const visible = new Set(
    sorted
      .filter((v) => {
        const l = live[v.id];
        return (!q || v.symbol.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)) && (status === "any" || l?.depositKey === status) && (range === "any" || l?.rangeKey === range);
      })
      .map((v) => v.id),
  );
  const openCount = singles.filter((p) => live[p.id]?.open === true).length;
  const known = singles.filter((p) => live[p.id] !== undefined && live[p.id]?.open !== null).length;
  const positions = singles.map((p) => live[p.id]?.position ?? null).filter((v): v is number => v !== null && v > 0);
  const positionsTotal = positions.reduce((a, b) => a + b, 0);
  const tvlTotal = rows ? formatUsd(usdgToNumber(sumColumn(rows, "assets"))) : "—";
  const feesTotal = rows ? formatUsd(usdgToNumber(sumColumn(rows, "fees"))) : "—";

  return (
    <div className="vault-table-page">
      <section className="masthead masthead-1120 masthead-bleed">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">Vaults</p>
              <h1>
                Put your USDG <em className="serif">to work.</em>
              </h1>
            </div>
            <p className="masthead-intro">Earn yield through tokenized stock vaults.</p>
          </div>
          <div className="mast-stats">
            <article>
              <span className="stat-label">Total value locked</span>
              <strong className="stat-value">{tvlTotal}</strong>
              <span className="stat-note">{rows ? `Across ${rows.length} vault${rows.length === 1 ? "" : "s"}` : error ? "Totals unavailable · retrying" : "Loading vault figures…"}</span>
            </article>
            <article>
              <span className="stat-label">Vaults open</span>
              <strong className="stat-value">{singles.length === 0 ? "—" : known === 0 ? "…" : `${openCount} of ${singles.length}`}</strong>
              <span className="stat-note">At the last recorded update</span>
            </article>
            <article>
              <span className="stat-label">Fees earned, lifetime</span>
              <strong className="stat-value">{feesTotal}</strong>
              <span className="stat-note">Gross, before the split</span>
            </article>
            <article>
              <span className="stat-label">Your positions</span>
              <strong className="stat-value">{owner ? (positions.length === 0 ? "None" : `${positions.length} · ${formatUsd(positionsTotal)}`) : "—"}</strong>
              <span className="stat-note">{owner ? "Share value at current vault prices" : "Connect to see your balances"}</span>
            </article>
          </div>
        </div>
      </section>
      <div className="vault-table-toolbar">
        <label className="vault-table-search">
          <Search size={15} strokeWidth={1.5} aria-hidden="true" />
          <input type="search" placeholder="Search ticker or company" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search vaults" />
        </label>
        <label className="vault-table-sort">
          <span>Status:</span>
          <select aria-label="Filter by deposit status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="any">Any</option>
            <option value="open">Open</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="vault-table-sort">
          <span>Sort:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort vaults">
            <option value="tvl">TVL</option>
            <option value="apr">Fee APR</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label className="vault-table-sort">
          <span>Range:</span>
          <select aria-label="Filter by range" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="any">Any</option>
            <option value="in-range">In range</option>
            <option value="out-of-range">Out of range</option>
            <option value="waiting">Awaiting LP</option>
            <option value="recovery">Recovery</option>
            <option value="none">No pool</option>
          </select>
        </label>
        <span className="vault-table-note mono">Est. fee APR · 24h · not a forecast</span>
      </div>
      {singles.length === 0 ? (
        <div className="vault-table-empty" role="status">
          <strong>{error ? "Vault list unavailable" : "No individual vaults are live yet"}</strong>
          <span>{error ? "The vault catalogue could not be verified. This page retries automatically." : "Vaults appear here as soon as a reviewed deployment is published."}</span>
        </div>
      ) : (
        <div className="vault-table-scroll">
          <table className="vault-table">
            <colgroup>
              <col className="col-vault" />
              <col className="col-status" />
              <col className="col-tvl" />
              <col className="col-apr" />
              <col className="col-range" />
              <col className="col-health" />
              <col className="col-position" />
              <col className="col-action" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Vault</th>
                <th scope="col">Status</th>
                <th scope="col" className="vault-table-num">
                  TVL
                </th>
                <th scope="col" className="vault-table-apr-heading" title="Estimated annualized fee return over the past 24 hours; shorter observed windows are noted below.">
                  Fee APR · 24h
                </th>
                <th scope="col">Price range (USDG)</th>
                <th scope="col">LP status</th>
                <th scope="col" className="vault-table-num">
                  Your position
                </th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => (
                <Row key={v.pin.vault} pin={v.pin} owner={owner} snapshotTvl={v.snapshotTvl} onLive={onLive} hidden={!visible.has(v.id)} />
              ))}
              {visible.size === 0 ? (
                <tr>
                  <td colSpan={8} className="vault-table-muted">
                    No vaults match your filters.{" "}
                    <button
                      type="button"
                      className="vault-table-reset"
                      onClick={() => {
                        setQuery("");
                        setStatus("any");
                        setRange("any");
                      }}
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      {snapshot ? (
        <p className="vault-table-updated" role="status">
          Updated {new Date(snapshot.observedAt).toLocaleTimeString()}. {error ? "Refresh delayed; showing the last available figures." : "Balances refresh automatically in the background."}
        </p>
      ) : null}
      <p className="vault-table-footnote">
        Fee APR annualizes each vault’s observed trading fees after protocol fees against its observed capital over a rolling 24-hour window.
        Shorter histories are labeled beside the estimate. It excludes token price changes and execution costs and is not a forecast. Vault
        shares carry Stock Token price exposure and are not principal-protected.
      </p>
    </div>
  );
}
