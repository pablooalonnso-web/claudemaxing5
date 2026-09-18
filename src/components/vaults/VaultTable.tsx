"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { PrefetchLink } from "@/components/PrefetchLink";
import { StockLogo, stockName } from "@/components/StockLogo";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { useVaultView } from "@/components/data/useVaultView";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n";
import { formatPercent, formatPrice, formatUsd, usdgToNumber } from "@/lib/format";
import type { VaultPin } from "@/lib/registry";
import { aprWindow, depositStatus, primaryPosition, rangePosition, rangeStatus, sumColumn } from "@/lib/vault-math";

type LiveInfo = { tvl: number | null; apr: number | null; open: boolean | null; position: number | null; depositKey: string; rangeKey: string };

/** Translated form of `describeAprWindow`. */
function aprWindowText(t: TFunction, info: Parameters<typeof aprWindow>[0]) {
  const w = aprWindow(info);
  if (w.key === "collecting") return t("apr.collecting");
  const span = w.unit === "day" ? t("apr.span.day") : t(`apr.span.${w.unit}`, { n: w.value });
  return t(w.stale ? "apr.observedStale" : "apr.observed", { span });
}

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
  const t = useT("vaults");
  const view = useVaultView(pin, owner);
  const holdings = view.holdings;
  const tvl = usdgToNumber(holdings?.totalAssets ?? snapshotTvl);
  const deposit = depositStatus(view.extras?.depositsEnabled, view.extras?.depositsPaused);
  const range = rangeStatus(holdings ? holdings.positions : null);
  const rangeLabel = t(`rangeStatus.${range.labelKey}`);
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
        <span className={`vault-table-tag vault-table-tag-${deposit.key}`}>{t(`depositStatus.${deposit.labelKey}`)}</span>
      </td>
      <td data-label={t("table.tvl")} className="mono vault-table-num">
        {formatUsd(tvl)}
      </td>
      <td data-label={t("table.feeApr")} className="mono vault-table-num vault-table-apr" title={aprWindowText(t, view.aprInfo)}>
        {apr === null ? (
          <span className="vault-table-muted" title={t("table.aprMissing")}>
            –
          </span>
        ) : (
          formatPercent(apr)
        )}
      </td>
      <td data-label={t("table.priceRange")}>
        {position && position.lower !== null && position.upper !== null ? (
          <span
            className="vault-table-range"
            role="img"
            aria-label={t("table.rangeAria", { lower: formatPrice(position.lower), upper: formatPrice(position.upper), current: formatPrice(position.current) })}
          >
            <small className="mono">{formatPrice(position.lower)}</small>
            <span className="vault-table-track">{pct !== null ? <i className={range.key === "out-of-range" ? "out" : ""} style={{ left: `${pct}%` }} /> : null}</span>
            <small className="mono">{formatPrice(position.upper)}</small>
          </span>
        ) : (
          <span className="vault-table-muted">{rangeLabel}</span>
        )}
      </td>
      <td data-label={t("table.lpStatus")}>
        <span className={`vault-table-tag vault-table-tag-${range.key}`}>{rangeLabel}</span>
      </td>
      <td data-label={t("table.yourPosition")} className="mono vault-table-num">
        {owner ? (
          yours === null ? (
            <span className="vault-table-muted">
              {view.position && view.position.shares > 0n ? t("table.shares", { n: Number(formatUnits(view.position.shares, 18)).toLocaleString(undefined, { maximumSignificantDigits: 6 }) }) : t("table.updating")}
            </span>
          ) : yours === 0 ? (
            <span className="vault-table-muted">–</span>
          ) : (
            formatUsd(yours)
          )
        ) : (
          <span className="vault-table-muted" title={t("table.connectToSee")}>
            –
          </span>
        )}
      </td>
      <td className="vault-table-action">
        <PrefetchLink className={`btn btn-sm ${deposit.key === "open" ? "btn-primary" : "btn-ghost"}`} href={pin.href}>
          {deposit.key === "open" ? t("table.deposit") : t("table.view")}
        </PrefetchLink>
      </td>
    </tr>
  );
}

export function VaultTable() {
  const t = useT("vaults");
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
  const tvlTotal = rows ? formatUsd(usdgToNumber(sumColumn(rows, "assets"))) : "–";
  const feesTotal = rows ? formatUsd(usdgToNumber(sumColumn(rows, "fees"))) : "–";

  return (
    <div className="vault-table-page">
      <section className="masthead masthead-1120 masthead-bleed">
        <div className="masthead-inner">
          <div className="masthead-head">
            <div className="masthead-title">
              <p className="eyebrow">{t("hero.eyebrow")}</p>
              <h1>
                {t("hero.title.before")}
                <em className="serif">{t("hero.title.em")}</em>
              </h1>
            </div>
            <p className="masthead-intro">{t("hero.intro")}</p>
          </div>
          <div className="mast-stats">
            <article>
              <span className="stat-label">{t("stats.tvl")}</span>
              <strong className="stat-value">{tvlTotal}</strong>
              <span className="stat-note">{rows ? t(rows.length === 1 ? "stats.acrossOne" : "stats.acrossMany", { n: rows.length }) : error ? t("stats.totalsUnavailable") : t("stats.loading")}</span>
            </article>
            <article>
              <span className="stat-label">{t("stats.open")}</span>
              <strong className="stat-value">{singles.length === 0 ? "–" : known === 0 ? "…" : t("stats.openOf", { open: openCount, total: singles.length })}</strong>
              <span className="stat-note">{t("stats.openNote")}</span>
            </article>
            <article>
              <span className="stat-label">{t("stats.fees")}</span>
              <strong className="stat-value">{feesTotal}</strong>
              <span className="stat-note">{t("stats.feesNote")}</span>
            </article>
            <article>
              <span className="stat-label">{t("stats.positions")}</span>
              <strong className="stat-value">{owner ? (positions.length === 0 ? t("stats.none") : t("stats.positionsValue", { count: positions.length, value: formatUsd(positionsTotal) })) : "–"}</strong>
              <span className="stat-note">{owner ? t("stats.positionsNote") : t("stats.connectNote")}</span>
            </article>
          </div>
        </div>
      </section>
      <div className="vault-table-toolbar">
        <label className="vault-table-search">
          <Search size={15} strokeWidth={1.5} aria-hidden="true" />
          <input type="search" placeholder={t("toolbar.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("toolbar.searchAria")} />
        </label>
        <label className="vault-table-sort">
          <span>{t("toolbar.status")}</span>
          <select aria-label={t("toolbar.statusAria")} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="any">{t("toolbar.any")}</option>
            <option value="open">{t("depositStatus.open")}</option>
            <option value="paused">{t("depositStatus.paused")}</option>
            <option value="closed">{t("depositStatus.closed")}</option>
          </select>
        </label>
        <label className="vault-table-sort">
          <span>{t("toolbar.sort")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("toolbar.sortAria")}>
            <option value="tvl">{t("toolbar.sortTvl")}</option>
            <option value="apr">{t("toolbar.sortApr")}</option>
            <option value="name">{t("toolbar.sortName")}</option>
          </select>
        </label>
        <label className="vault-table-sort">
          <span>{t("toolbar.range")}</span>
          <select aria-label={t("toolbar.rangeAria")} value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="any">{t("toolbar.any")}</option>
            <option value="in-range">{t("rangeStatus.in-range")}</option>
            <option value="out-of-range">{t("rangeStatus.out-of-range")}</option>
            <option value="waiting">{t("toolbar.awaitingLp")}</option>
            <option value="recovery">{t("rangeStatus.recovery")}</option>
            <option value="none">{t("toolbar.noPool")}</option>
          </select>
        </label>
        <span className="vault-table-note mono">{t("toolbar.note")}</span>
      </div>
      {singles.length === 0 ? (
        <div className="vault-table-empty" role="status">
          <strong>{error ? t("empty.unavailable") : t("empty.none")}</strong>
          <span>{error ? t("empty.unavailableBody") : t("empty.noneBody")}</span>
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
                <th scope="col">{t("table.vault")}</th>
                <th scope="col">{t("table.status")}</th>
                <th scope="col" className="vault-table-num">
                  {t("table.tvl")}
                </th>
                <th scope="col" className="vault-table-apr-heading" title={t("table.aprTitle")}>
                  {t("table.feeApr")}
                </th>
                <th scope="col">{t("table.priceRange")}</th>
                <th scope="col">{t("table.lpStatus")}</th>
                <th scope="col" className="vault-table-num">
                  {t("table.yourPosition")}
                </th>
                <th scope="col">
                  <span className="sr-only">{t("table.action")}</span>
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
                    {t("empty.noMatch")}{" "}
                    <button
                      type="button"
                      className="vault-table-reset"
                      onClick={() => {
                        setQuery("");
                        setStatus("any");
                        setRange("any");
                      }}
                    >
                      {t("empty.clear")}
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
          {t("updated.at", { time: new Date(snapshot.observedAt).toLocaleTimeString() })} {error ? t("updated.delayed") : t("updated.auto")}
        </p>
      ) : null}
      <p className="vault-table-footnote">{t("footnote")}</p>
    </div>
  );
}
