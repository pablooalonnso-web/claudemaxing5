"use client";

import { ArrowUpRight } from "lucide-react";
import { PrefetchLink } from "@/components/PrefetchLink";
import { StockLogo } from "@/components/StockLogo";
import { useProtocolVaults } from "@/components/data/ProtocolVaultProvider";
import { useVaultView } from "@/components/data/useVaultView";
import { formatPercent, formatUsd, usdgToNumber } from "@/lib/format";
import type { VaultPin } from "@/lib/registry";
import { describeAprWindow, primaryPosition, rangePosition, rangeStatus } from "@/lib/vault-math";

function BoardRow({ pin, snapshotTvl, snapshotApr }: { pin: VaultPin; snapshotTvl: string | null; snapshotApr: number | null }) {
  const view = useVaultView(pin);
  const holdings = view.holdings;
  const position = primaryPosition(holdings?.positions);
  const range = rangeStatus(holdings ? holdings.positions : null);
  const pct = position ? rangePosition(position.lower, position.upper, position.current) : null;
  return (
    <li>
      <PrefetchLink href={pin.href} className="home-board-row">
        <StockLogo symbol={pin.symbol} size={34} />
        <span className="home-board-name">
          <b>{pin.symbol}</b>
          <small className="mono">{pin.symbol} / USDG</small>
        </span>
        <span className="mono home-board-tvl">{formatUsd(usdgToNumber(holdings?.totalAssets ?? snapshotTvl))}</span>
        <span className="mono home-board-apr" title={describeAprWindow(view.aprInfo)}>
          {snapshotApr === null ? "—" : formatPercent(snapshotApr)}
        </span>
        <span className="home-board-track" role="img" aria-label={range.label}>
          {pct !== null ? <i className={range.key === "out-of-range" ? "out" : ""} style={{ left: `${pct}%` }} /> : null}
        </span>
      </PrefetchLink>
    </li>
  );
}

export function HomeVaultBoard() {
  const { singles, snapshot, error } = useProtocolVaults();
  const rows = snapshot?.rows.filter((r) => r.kind === "single" || r.kind === "managed") ?? null;
  const top = singles
    .map((pin) => {
      const row = rows?.find((r) => r.vault.toLowerCase() === pin.vault.toLowerCase());
      return { pin, apr: row?.apr ?? null, assets: row?.assets ?? null };
    })
    .sort((a, b) => {
      if (a.apr !== b.apr) return a.apr === null ? 1 : b.apr === null ? -1 : b.apr - a.apr;
      const av = a.assets === null ? -1 : Number(a.assets);
      const bv = b.assets === null ? -1 : Number(b.assets);
      return bv - av;
    })
    .slice(0, 5);
  return (
    <div className="home-board">
      <div className="home-board-head">
        <span className="eyebrow">Top vaults by APR</span>
        <PrefetchLink href="/vaults">
          All vaults <ArrowUpRight size={14} strokeWidth={1.5} />
        </PrefetchLink>
      </div>
      {top.length === 0 ? (
        <p className="home-board-empty" role="status">
          {error
            ? "The vault list could not be verified. Retrying automatically."
            : snapshot
              ? "No individual vault is live yet. The first reviewed deployment will appear here."
              : "Loading vault figures…"}
        </p>
      ) : (
        <>
          <div className="home-board-columns mono" aria-hidden="true">
            <span>Vault</span>
            <span>TVL</span>
            <span>Est. fee APR</span>
            <span>Range</span>
          </div>
          <ul className="home-board-list">
            {top.map(({ pin, assets, apr }) => (
              <BoardRow key={pin.vault} pin={pin} snapshotTvl={assets} snapshotApr={apr} />
            ))}
          </ul>
        </>
      )}
      <p className="home-board-note">Estimated fee APR · 24-hour window · after protocol fees</p>
    </div>
  );
}
